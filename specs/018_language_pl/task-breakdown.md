# Task Breakdown: Polish Language Support

Generated: 2026-03-05
Source: specs/018_language_pl/feat-language-pl.md

## Overview

Add Polish language support across the entire app: UI translations, OCR text recognition, tag localization, search normalization, and a Settings screen. Two global preferences (UI language, OCR language) plus per-book language control.

## Phase 1: Language Types + Preferences Infrastructure

### Task 1.1: Create language type system
**Size**: Small | **Priority**: High | **Dependencies**: None

Create `lib/types/language.ts`:

```typescript
export type AppLanguage = "en" | "pl";
export const APP_LANGUAGES: ReadonlyArray<AppLanguage> = ["en", "pl"] as const;
export const LANGUAGE_DISPLAY_NAMES: Record<AppLanguage, string> = {
  en: "English",
  pl: "Polski",
};
```

**Acceptance Criteria**:
- [ ] `AppLanguage` type exported and usable across codebase
- [ ] Display names are endonyms (each language in its own name)

---

### Task 1.2: Create PreferencesRepository
**Size**: Small | **Priority**: High | **Dependencies**: 1.1

Create `lib/repositories/preferences.ts` using the app's `lib/storage/` abstraction (same pattern as `SourceRepository`, `TagsRepository`):

```typescript
import { storage } from "../storage";
import type { StorageKey } from "../types/primitives";
import type { AppLanguage } from "../types/language";

const UI_LANGUAGE_KEY: StorageKey = "@preferences:uiLanguage";
const OCR_LANGUAGE_KEY: StorageKey = "@preferences:ocrLanguage";

class PreferencesRepository {
  async getUiLanguage(): Promise<AppLanguage> {
    const value = await storage.getItem(UI_LANGUAGE_KEY);
    return value === "pl" ? "pl" : "en";
  }
  async setUiLanguage(lang: AppLanguage): Promise<void> {
    await storage.setItem(UI_LANGUAGE_KEY, lang);
  }
  async getOcrLanguage(): Promise<AppLanguage> {
    const value = await storage.getItem(OCR_LANGUAGE_KEY);
    return value === "pl" ? "pl" : "en";
  }
  async setOcrLanguage(lang: AppLanguage): Promise<void> {
    await storage.setItem(OCR_LANGUAGE_KEY, lang);
  }
}

export const preferencesRepository = new PreferencesRepository();
```

No lock chain needed — simple key-value writes with no read-modify-write races.

**Acceptance Criteria**:
- [ ] Uses `lib/storage/` (not AsyncStorage directly)
- [ ] Uses `StorageKey` type for key constants
- [ ] Defaults to `"en"` when no stored value exists
- [ ] Read/write for both UI and OCR language preferences

---

### Task 1.3: Create PreferencesContext
**Size**: Medium | **Priority**: High | **Dependencies**: 1.1, 1.2

Create `features/settings/context/PreferencesContext.tsx`:

```typescript
interface PreferencesContextValue {
  uiLanguage: AppLanguage;
  ocrLanguage: AppLanguage;
  setUiLanguage: (lang: AppLanguage) => Promise<void>;
  setOcrLanguage: (lang: AppLanguage) => Promise<void>;
}
```

Implementation requirements:
- Follow singleton promise pattern used by `TagsContext`, `SourcesContext`, `RecipesContext` (module-level promise, React 19 `use()` hook)
- On mount: read stored preferences, call `i18n.changeLanguage(storedUiLanguage)` before rendering children
- `setUiLanguage`: persist to storage AND call `i18n.changeLanguage(lang)`
- `setOcrLanguage`: persist to storage only
- All returned functions wrapped in `useCallback`, context value wrapped in `useMemo` (per AGENTS.md conventions)

Add `PreferencesProvider` to `app/_layout.tsx` between `Suspense` and `DebugProvider`:

```
GestureHandlerRootView
  Suspense
    PreferencesProvider           ← new
      DebugProvider
        SourcesProvider
          ...
```

Must be outermost because `SourcesProvider` needs `ocrLanguage` for defaulting new book language.

**Acceptance Criteria**:
- [ ] `usePreferences()` hook exported and working
- [ ] UI language change triggers `i18n.changeLanguage()` — all translated strings update immediately
- [ ] No flash of wrong language on mount (language set before children render)
- [ ] Provider chain order is correct in `_layout.tsx`

---

### Task 1.4: Polish translation file + i18n config
**Size**: Medium | **Priority**: High | **Dependencies**: None | **Can run parallel with**: 1.1, 1.2

Create `platform/i18n/translations/pl.json` with all keys from `en.json` translated to Polish. Full content is in spec Section 13 (~130 keys).

Polish pluralization uses three forms with `compatibilityJSON: "v4"`:
- `_one` (1): "1 przepis"
- `_few` (2-4, 22-24, etc.): "3 przepisy"
- `_many` (0, 5-21, 25-31, etc.): "5 przepisów"

Add new English keys to `en.json`:
```json
{
  "menu": { "settings": "Settings" },
  "manageBooks": { "setLanguageAction": "Language" },
  "settings": {
    "title": "Settings",
    "uiLanguage": "UI Language",
    "ocrLanguage": "OCR Language",
    "back": "Back"
  }
}
```

Update `platform/i18n/config.ts`:
```typescript
import en from "./translations/en.json";
import pl from "./translations/pl.json";

const resources = {
  en: { translation: en },
  pl: { translation: pl },
};

i18n.use(initReactI18next).init({
  compatibilityJSON: "v4",
  resources,
  lng: "en", // Default; overridden by PreferencesProvider on mount
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});
```

Remove auto-detect from `expo-localization` at init time (language is user-controlled via stored preference).

**Acceptance Criteria**:
- [ ] `pl.json` contains all keys from `en.json`
- [ ] Polish pluralization works: count=1 → `_one`, count=3 → `_few`, count=5 → `_many`, count=0 → `_many`
- [ ] `i18n.changeLanguage("pl")` switches all strings to Polish
- [ ] `config.ts` loads both `en` and `pl` resources

---

## Phase 2: Settings Screen + Menu

### Task 2.1: Create Settings screen
**Size**: Medium | **Priority**: High | **Dependencies**: 1.3, 1.4

Create `app/settings.tsx` following the pattern from `app/about.tsx`:
- Import `useTranslation` from `@/platform/i18n/useTranslation`
- Import `useTheme`, `getColors` from theme modules
- Use `LiquidGlassButton` for bottom back button
- Use `useSafeAreaInsets` from `react-native-safe-area-context`

Layout:
```
┌──────────────────────────────────┐
│            Settings              │
├──────────────────────────────────┤
│  UI Language                     │
│  ┌────────────────────────────┐  │
│  │  English                   │  │
│  │  Polski                    │  │
│  └────────────────────────────┘  │
│                                  │
│  OCR Language                    │
│  ┌────────────────────────────┐  │
│  │  English                   │  │
│  │  Polski                    │  │
│  └────────────────────────────┘  │
│                                  │
│  (←)                             │
└──────────────────────────────────┘
```

Each section: header + list of pressable rows with radio indicator. Selected option highlighted. Display names are endonyms from `LANGUAGE_DISPLAY_NAMES`.

When user selects UI language: `setUiLanguage(lang)` → persists + calls `i18n.changeLanguage()` → immediate switch.

**Acceptance Criteria**:
- [ ] Settings screen renders with both language sections
- [ ] Tapping a language option updates preference immediately
- [ ] UI language switch updates all visible strings without restart
- [ ] Back button navigates back via `router.back()`

---

### Task 2.2: Add Settings to global menu
**Size**: Small | **Priority**: High | **Dependencies**: 1.4

Update `features/recipes-list/hooks/useGlobalOptions.ts`:

1. Update `MenuOption` interface route type:
```typescript
route: "/manage-books" | "/about" | "/settings";
```

2. Add settings entry between manage-books and about:
```typescript
{
  id: "settings",
  label: t("menu.settings"),
  systemImage: "gearshape",
  route: "/settings",
},
```

**Acceptance Criteria**:
- [ ] "Settings" appears in global menu between "Your Books" and "About"
- [ ] Tapping navigates to `/settings` route
- [ ] Menu label is localized

---

## Phase 3: Book Language

### Task 3.1: Add language to Source type and repository
**Size**: Medium | **Priority**: High | **Dependencies**: 1.1

Update `lib/types/source.ts`:
```typescript
import type { AppLanguage } from "./language";
export interface Source {
  id: SourceId;
  name: string;
  language: AppLanguage;
  lastUsedAt: number;
}
```

Update `lib/repositories/sources.ts`:
- `create(name: string, language: AppLanguage)` — now accepts `language` parameter, includes it in `newSource`
- Add `setLanguage(id: SourceId, language: AppLanguage)` method (within `withLock`)
- `getAll()` — add defensive default: `sources.map(s => ({ ...s, language: s.language ?? "en" }))` to handle legacy data

**Acceptance Criteria**:
- [ ] `Source.language` is required `AppLanguage`
- [ ] `create()` accepts and persists language
- [ ] `setLanguage()` updates language atomically via `withLock`
- [ ] `getAll()` defaults missing language to `"en"`

---

### Task 3.2: Update SourcesContext for language
**Size**: Medium | **Priority**: High | **Dependencies**: 1.3, 3.1

Update `features/sources/context/SourcesContext.tsx`:

- `createSource` wraps repository call, injects default language from preferences:
```typescript
const { ocrLanguage } = usePreferences();
const createSource = useCallback(async (name: string, language?: AppLanguage) => {
  const lang = language ?? ocrLanguage;
  const newSource = await sourceRepository.create(name, lang);
  setSources(prev => [...prev, newSource]);
  return newSource;
}, [ocrLanguage]);
```

- Add `setSourceLanguage(id: SourceId, language: AppLanguage)` to context
- No signature changes needed at existing call sites (`SourceSelector`, manage books "Add Book", `AddRecipeForm` first book flow) — they call `createSource(name)` which defaults to `ocrLanguage`

**Acceptance Criteria**:
- [ ] New books default to preferred OCR language
- [ ] `setSourceLanguage()` updates book language and local state
- [ ] Existing call sites still work without changes

---

### Task 3.3: Show book language in manage-books
**Size**: Medium | **Priority**: Medium | **Dependencies**: 3.1, 3.2

Update `app/manage-books.tsx`:

- Show language in subtitle: `"5 recipes · EN"` or `"3 przepisy · PL"`
- Add tappable language badge in the row (always visible, no swipe needed)
- Tapping badge opens `Alert.alert` with two options: "English" and "Polski"
- On selection: call `setSourceLanguage(sourceId, newLanguage)`
- If language changed: reprocess ALL recipes from that book (no `manuallyEdited` filtering in V1)

Reprocessing logic:
```typescript
async function handleSetLanguage(sourceId: SourceId, newLanguage: AppLanguage) {
  const source = sources.find((s) => s.id === sourceId);
  if (!source || source.language === newLanguage) return;
  await setSourceLanguage(sourceId, newLanguage);
  const bookRecipes = recipes.filter(
    (r) => r.metadata.source === sourceId && r.status === "ready"
  );
  for (const recipe of bookRecipes) {
    addToQueue(recipe.id);
  }
}
```

**Acceptance Criteria**:
- [ ] Book language visible in row subtitle
- [ ] Tappable badge opens language picker
- [ ] Language change triggers reprocessing of all recipes in book
- [ ] Language badge shows localized action label

---

## Phase 4: OCR Language Support

### Task 4.1: Thread language through OCR pipeline
**Size**: Medium | **Priority**: High | **Dependencies**: 1.1

Update these files to pass language through the pipeline:

1. `lib/photo-processor/types.ts` — add `language?: AppLanguage` to OCR config:
```typescript
ocr: {
  enabled: boolean;
  language?: AppLanguage;
}
```

2. `lib/photo-processor/pipelines/text-recognition/text-recognition-pipeline.ts` — add `language` parameter:
```typescript
export async function processTextRecognition(
  imageDataUrl: DataUrl,
  language?: AppLanguage
): Promise<TextRecognitionResult> {
  const ocrResult = await extractText(imageDataUrl, language);
  // ... rest unchanged
}
```

3. `lib/photo-processor/index.ts` — forward language from config:
```typescript
if (config.ocr.enabled) {
  const textRecResult = await processTextRecognition(ocrImageDataUrl, config.ocr.language);
}
```

4. `lib/photo-processor/ocr-bridge/index.d.ts` — update type declaration:
```typescript
export function extractText(imageUri: DataUrl, language?: AppLanguage): Promise<OcrResult>;
```

5. `lib/photo-processor/ocr-bridge/index.web.ts` — add language support with worker reinit:
```typescript
const TESSERACT_LANGUAGE_MAP: Record<AppLanguage, string> = { en: "eng", pl: "pol" };
let worker: Worker | null = null;
let currentLang: string | null = null;

export async function extractText(imageUri: DataUrl, language: AppLanguage = "en"): Promise<OcrResult> {
  const tessLang = TESSERACT_LANGUAGE_MAP[language] ?? "eng";
  if (worker && currentLang !== tessLang) {
    await worker.terminate();
    worker = null;
    currentLang = null;
  }
  if (!worker) {
    worker = await createWorker(tessLang, 1, { /* ... */ });
    currentLang = tessLang;
  }
  // ... rest unchanged
}
```

6. `lib/photo-processor/ocr-bridge/index.native.ts` — **NO CHANGES** (Apple Vision + ML Kit auto-detect Polish)

**Acceptance Criteria**:
- [ ] Web OCR maps `"en"` → `"eng"`, `"pl"` → `"pol"`
- [ ] Worker is recreated when language changes
- [ ] Native bridge unchanged (still works with auto-detection)
- [ ] Language flows from config through pipeline to bridge

---

### Task 4.2: Pass book language in background processing
**Size**: Small | **Priority**: High | **Dependencies**: 3.1, 4.1

Update `features/background-processing/context/BackgroundProcessingContext.tsx`:

In `processRecipe(recipeId)`:
```typescript
const recipe = await recipeRepository.getById(recipeId);
const sourceId = recipe.metadata.source;
let bookLanguage: AppLanguage = "en";
if (sourceId && !isUrl(sourceId)) {
  const source = await sourceRepository.getById(sourceId);
  bookLanguage = source?.language ?? "en";
}

const result = await processPhoto(photoDataUrl, {
  ...DEFAULT_CONFIG,
  ocr: { enabled: true, language: bookLanguage },
});
```

**Acceptance Criteria**:
- [ ] Book language read from source for each recipe
- [ ] Language passed through OCR config to `processPhoto()`
- [ ] Falls back to `"en"` if source not found or is a URL

---

## Phase 5: Tag Localization + Search

### Task 5.1: Create tag display labels
**Size**: Medium | **Priority**: High | **Dependencies**: 1.1

Create `features/tags/utils/tagDisplayLabels.ts` with:
- `TAG_DISPLAY_LABELS: Record<LabelKey, Record<AppLanguage, string>>` — full mapping of ~50 tags with en/pl translations (see spec Section 7 for complete list)
- `getTagDisplayLabel(tag: Tag, uiLanguage: AppLanguage): string` helper

```typescript
export function getTagDisplayLabel(tag: Tag, uiLanguage: AppLanguage): string {
  const labels = TAG_DISPLAY_LABELS[tag.normalizedLabel as LabelKey];
  if (labels) {
    return `#${labels[uiLanguage] ?? tag.normalizedLabel}`;
  }
  return tag.label; // User-created tags: show as-is
}
```

**Acceptance Criteria**:
- [ ] Every key in `SEASON_LABELS`, `CUISINE_LABELS`, `CATEGORY_LABELS` has an entry with both `en` and `pl`
- [ ] No blank or missing translations
- [ ] User-created tags fall through unchanged

---

### Task 5.2: Update search normalization
**Size**: Medium | **Priority**: High | **Dependencies**: 5.1

Update `features/tags/utils/resolveRecipeTags.ts`:

- `resolveNormalizedTagTexts` — expand to include all language variants:
```typescript
export function resolveNormalizedTagTexts(tagIds: Array<TagId>, lookup: Map<TagId, Tag>): Array<string> {
  return tagIds.flatMap((id) => {
    const tag = lookup.get(id);
    if (!tag) return [];
    const labels = TAG_DISPLAY_LABELS[tag.normalizedLabel as LabelKey];
    if (labels) {
      return [tag.normalizedLabel, ...Object.values(labels).map((l) => l.toLowerCase())];
    }
    return [tag.normalizedLabel];
  });
}
```

- Add `resolveLocalizedTagLabels` for display-time localization:
```typescript
export function resolveLocalizedTagLabels(
  tagIds: Array<TagId>, lookup: Map<TagId, Tag>, language: AppLanguage
): Array<string> {
  return tagIds.map((id) => {
    const tag = lookup.get(id);
    if (!tag) return id;
    const localizedLabel = TAG_DISPLAY_LABELS[tag.normalizedLabel as LabelKey];
    if (localizedLabel) return localizedLabel[language] ?? tag.normalizedLabel;
    return tag.normalizedLabel;
  });
}
```

Update `features/search/hooks/useTagSuggestions.ts` — match against localized labels:
```typescript
const matchesPrefix = (tag: Tag, prefix: string): boolean => {
  if (tag.normalizedLabel.startsWith(prefix)) return true;
  const labels = TAG_DISPLAY_LABELS[tag.normalizedLabel as LabelKey];
  if (labels) {
    return Object.values(labels).some((l) => l.toLowerCase().startsWith(prefix));
  }
  return false;
};
```

**Acceptance Criteria**:
- [ ] Searching "zupa" matches recipes tagged `#soup`
- [ ] Searching "soup" also matches (English still works)
- [ ] Tag suggestions show when typing Polish terms (e.g., "zu" shows soup/zupa)
- [ ] `filterRecipes` benefits automatically from expanded `resolveNormalizedTagTexts`

---

### Task 5.3: Localize tag display at call sites
**Size**: Medium | **Priority**: High | **Dependencies**: 1.3, 5.1

Localization happens at **call sites**, not inside generic atom components (`TagList`, `TagInput`, `GlassLikeTagInput` are NOT modified).

Update these call sites:
- `features/recipe-form/components/MetadataFormFields.tsx` — convert tags to/from localized display strings before passing to `GlassLikeTagInput`
- Recipe card/detail views — use `resolveLocalizedTagLabels()` instead of `resolveTagLabels()`, passing `uiLanguage`
- `useTagSuggestions.ts` — return localized label in `TagSuggestion.label`

**Acceptance Criteria**:
- [ ] Tags display in Polish when UI language is Polish
- [ ] Tags display in English when UI language is English
- [ ] Tag editing still works (canonical keys preserved on save)
- [ ] `TagList`, `TagInput`, `GlassLikeTagInput` atoms unchanged

---

### Task 5.4: Add Polish keywords to classifier labels
**Size**: Small | **Priority**: Medium | **Dependencies**: None | **Can run parallel with**: all Phase 5

Update `lib/text-classifier/labels.ts` — append Polish keywords to each label's description string:

```typescript
// Example additions to SEASON_LABELS
whole_year: "all-season, year-round, everyday cooking, ..., cały rok, codzienne, szybkie, obiad, kolacja, śniadanie",
spring: "fresh vegetables, asparagus, ..., wiosna, szparagi, rzodkiewka, rabarbar, szczypiorek",
```

The classification algorithms already tokenize on whitespace/commas, so mixed-language descriptions work naturally.

**Acceptance Criteria**:
- [ ] Each season, cuisine, and category label has Polish keywords appended
- [ ] TF-IDF classifier benefits from Polish keywords for Polish text
- [ ] Existing English classification unaffected

---

## Summary

| Phase | Tasks | Can parallelize? |
|-------|-------|-----------------|
| Phase 1: Infrastructure | 1.1, 1.2, 1.3, 1.4 | 1.1+1.4 parallel; 1.2 depends on 1.1; 1.3 depends on 1.1+1.2 |
| Phase 2: Settings UI | 2.1, 2.2 | 2.2 can run parallel with 2.1 |
| Phase 3: Book Language | 3.1, 3.2, 3.3 | 3.1 first, then 3.2+3.3 |
| Phase 4: OCR Pipeline | 4.1, 4.2 | 4.1 first, then 4.2 |
| Phase 5: Tags + Search | 5.1, 5.2, 5.3, 5.4 | 5.4 parallel with all; 5.2+5.3 depend on 5.1 |

**Total**: 15 tasks across 5 phases
**Critical path**: 1.1 → 1.2 → 1.3 → 2.1 (Settings screen working end-to-end)
**Highest parallelism**: Phase 5 (up to 3 tasks at once)
