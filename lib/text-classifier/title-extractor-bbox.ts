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

interface BboxInput {
  image: string;
  observations: Array<BboxObservation>;
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

export function titlesMatch(
  extracted: string | undefined,
  expected: string,
): boolean {
  if (extracted === undefined || extracted === "") {
    return false;
  }
  const extractedNorm = normForMatch(extracted);
  const expectedParts = expected.split("+").map((p) => normForMatch(p));

  // Primary: substring containment
  if (expectedParts.every((part) => extractedNorm.includes(part))) {
    return true;
  }

  // Fallback: word-level matching
  const extractedWordList = extractedNorm.split(" ");
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

// ── Constants ──────────────────────────────────────────────────────────────────

const _MEASUREMENT_RE = new RegExp(
  "\\b\\d+\\s*(g|ml|kg|cup|cups|tbsp|tsp|tablespoon|teaspoon|oz|" +
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
    "|\\bSERVES\\s+\\d|\\bMAKES\\s*:?\\s*\\d|\\bYIELD\\b)",
  "i",
);

// ── Internal helpers ───────────────────────────────────────────────────────────

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
      const or_ = ox + o.bbox.width;

      if (or_ <= splitX + 0.01) {
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
  allRegions: Array<Region>,
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
  const maxMlh = Math.max(
    ...allRegions.map((r) => r.mean_line_height),
  );
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
  const maxDensity = Math.max(
    ...allRegions.map((r) => r.char_density),
  );
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
  // Use Unicode property escape to match all alphabetic characters (like Python's str.isalpha())
  const alphaChars = [...region.text].filter((c) =>
    /\p{L}/u.test(c),
  );
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
    /\p{L}/u.test(c),
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

  // Score all regions
  const scored: Array<[number, Region]> = regions.map((r) => [
    scoreTitleRegion(r, regions),
    r,
  ]);
  scored.sort((a, b) => b[0] - a[0]);

  // Greedy multi-region merge
  let primaryText: string | undefined = undefined;
  let primaryY: number | undefined = undefined;
  const usedRegionIndices = new Set<number>();

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
        primaryY = mergedRegions[0].bbox.y;
        // Track used regions by finding their index in scored
        for (const mr of mergedRegions) {
          const idx = scored.findIndex(([, r]) => r === mr);
          if (idx >= 0) {
            usedRegionIndices.add(idx);
          }
        }
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
        primaryY = region.bbox.y;
        usedRegionIndices.add(i);
        break;
      }
      // For regions too long to be titles, try extracting just the
      // leading observation(s)
      if (region.text.length > 200) {
        const leading = extractLeadingTitle(region);
        if (leading !== undefined && validateTitleText(leading)) {
          primaryText = leading;
          primaryY = region.bbox.y;
          usedRegionIndices.add(i);
          break;
        }
      }
    }
  }

  if (primaryText === undefined || primaryY === undefined) {
    return undefined;
  }

  // Compute primary region X bounds for multi-recipe column detection.
  let primaryXLeft: number | undefined = undefined;
  let primaryXRight: number | undefined = undefined;
  for (let i = 0; i < scored.length; i++) {
    if (usedRegionIndices.has(i)) {
      const r = scored[i][1];
      primaryXLeft =
        primaryXLeft === undefined
          ? r.bbox.x
          : Math.min(primaryXLeft, r.bbox.x);
      primaryXRight =
        primaryXRight === undefined
          ? r.bbox.x + r.bbox.width
          : Math.max(primaryXRight, r.bbox.x + r.bbox.width);
    }
  }

  // Multi-recipe page detection
  const maxMlh = Math.max(
    ...regions.map((r) => r.mean_line_height),
  );
  const additional: Array<[number, string]> = [];

  for (let i = 0; i < scored.length; i++) {
    if (usedRegionIndices.has(i)) {
      continue;
    }
    const region = scored[i][1];

    // Must be well-separated vertically OR horizontally separated
    const yGap = Math.abs(region.bbox.y - primaryY);
    let xSeparated = false;
    if (primaryXLeft !== undefined && primaryXRight !== undefined) {
      const rLeft = region.bbox.x;
      const rRight = rLeft + region.bbox.width;
      xSeparated =
        rRight < primaryXLeft - 0.05 ||
        rLeft > primaryXRight + 0.05;
    }
    if (yGap < 0.15 && !xSeparated) {
      continue;
    }

    // Must have large font relative to page
    const relH =
      maxMlh > 0 ? region.mean_line_height / maxMlh : 0;
    const minRelH = xSeparated ? 0.4 : 0.55;
    if (relH < minRelH) {
      continue;
    }

    // Must be short text
    let text = stripTrailingIngredients(region.text);
    if (text.length > 60) {
      const leading = extractLeadingTitle(region);
      if (leading !== undefined && leading.length <= 60) {
        text = leading;
      } else {
        continue;
      }
    }
    // Must pass title validation
    if (!validateTitleText(text)) {
      continue;
    }
    additional.push([region.bbox.y, text]);
  }

  // Observation-level sub-title scan
  const primaryNormWords = new Set(
    normForMatch(primaryText).split(" "),
  );
  const allObs = regions
    .flatMap((r) => r.observations)
    .sort((a, b) => a.bbox.y - b.bbox.y);

  for (let i = 0; i < allObs.length; i++) {
    const obs = allObs[i];
    const text = obs.text.trim();
    if (text.length < 4 || text.length > 30) {
      continue;
    }
    // Section labels end with ":"
    if (text.endsWith(":")) {
      continue;
    }
    // Must be mostly uppercase (title-like)
    // Use Unicode property escape to match all alphabetic characters (like Python's str.isalpha())
    const alpha = [...text].filter((c) => /\p{L}/u.test(c));
    if (
      alpha.length === 0 ||
      alpha.filter((c) => c === c.toUpperCase()).length /
        alpha.length <
        0.8
    ) {
      continue;
    }
    // Must have a significant vertical gap above
    const obsLeft = obs.bbox.x;
    const obsRight = obsLeft + obs.bbox.width;
    let gapAbove: number | undefined = undefined;
    for (let j = i - 1; j >= 0; j--) {
      const prev = allObs[j];
      const pLeft = prev.bbox.x;
      const pRight = pLeft + prev.bbox.width;
      // Check X overlap (same column)
      if (Math.min(obsRight, pRight) - Math.max(obsLeft, pLeft) > 0) {
        const prevBottom = prev.bbox.y + prev.bbox.height;
        gapAbove = obs.bbox.y - prevBottom;
        break;
      }
    }
    if (gapAbove === undefined || gapAbove < 0.03) {
      continue;
    }
    // Must be well-separated from primary title
    if (Math.abs(obs.bbox.y - primaryY) < 0.08) {
      continue;
    }
    // Skip if all words already in primary title
    const obsWords = new Set(normForMatch(text).split(" "));
    let allInPrimary = true;
    for (const w of obsWords) {
      if (!primaryNormWords.has(w)) {
        allInPrimary = false;
        break;
      }
    }
    if (allInPrimary) {
      continue;
    }
    if (!validateTitleText(text)) {
      continue;
    }
    additional.push([obs.bbox.y, text]);
  }

  if (additional.length > 0) {
    additional.sort((a, b) => a[0] - b[0]);
    // Deduplicate by normalized words
    const seenWords = new Set<string>();
    for (const [, text] of additional) {
      const words = [...normForMatch(text).split(" ")]
        .sort()
        .join(" ");
      if (!seenWords.has(words)) {
        seenWords.add(words);
        primaryText += " " + text;
      }
    }
  }

  return primaryText;
}

export type { BboxObservation, BboxInput, Region };
