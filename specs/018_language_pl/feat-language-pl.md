# Polish Language Support

**Status:** Draft
**Authors:** Claude, 2026-03-04

## Overview

Add multilingual support for Polish (`pl`) alongside English (`en`) across the entire app surface: UI translations, OCR text recognition, tag classification and display, search input normalization, and a new Settings screen for managing language preferences. Each book gains a `language` property that controls OCR processing, while UI language and preferred OCR language are global user preferences.

## Background / Problem Statement

The app currently operates in English only:

- **UI**: All strings are English (`platform/i18n/translations/en.json`). The i18n framework (i18next + react-i18next) is installed but only English resources are loaded.
- **OCR**: The web implementation hardcodes `"eng"` for Tesseract.js (`lib/photo-processor/ocr-bridge/index.web.ts:26`). The native implementation (Apple Vision / ML Kit) defaults to device language detection with no explicit control.
- **Tags**: Tag labels in `lib/text-classifier/labels.ts` are English-only keyword descriptions. Tags are stored and displayed as raw English keys (e.g., `#pasta`, `#italian`, `#whole_year`).
- **Search**: Fuzzy search (`features/recipes-list/utils/recipeSearch.ts`) matches against English tag keys only.

The app's author is Polish. Many users will have Polish-language cookbooks. Without Polish OCR support, text recognition on Polish recipe pages produces poor results. Without Polish UI, the app is inaccessible to non-English-speaking users.

## Goals

- Two-language UI: English and Polish, user-selectable via Settings
- Per-book OCR language: each book stores `en` or `pl`; new books default to the user's preferred OCR language
- Canonical, language-agnostic tag IDs with localized display labels (at least `en` and `pl`)
- Search normalization: both English and Polish query terms resolve to canonical tag IDs
- Settings screen accessible via global menu cog icon
- Book language editing via globe icon action in manage-books screen
- Automatic reprocessing of untouched recipes when book language changes
- Extensible architecture: adding a third language later should require only new translation files and label entries, not structural changes

## Non-Goals

- More than two languages in V1 (only `en` and `pl`)
- "System" language option that auto-detects from device locale
- Tag suggestion/autocomplete UI during search
- Migration of existing data (test instance will be reset)
- Native OCR language configuration (both Apple Vision and ML Kit auto-detect Polish; language parameter only needed for web/Tesseract.js)
- Translation of recognized text itself (OCR output stays in the source language)

## Technical Dependencies

- `i18next` 25.6.0 — already installed, supports multiple resource bundles
- `react-i18next` 16.0.1 — already installed, `useTranslation` hook
- `expo-localization` — already installed, device locale detection for phone icon indicator
- `tesseract.js` 6.0.1 — already installed; Polish language data (`pol`) downloaded on demand by the worker
- `expo-text-extractor` 0.2.2 — native OCR; Apple Vision and ML Kit auto-detect Polish (no API changes needed)
- `lib/storage/` — app's existing storage abstraction (file-system on native, localforage on web), used for persisting preferences
- `@expo/vector-icons` 15.0.2 — already installed, provides globe icon and phone icon

No new external dependencies required.

## Detailed Design

### 1. Language Type System

```typescript
// lib/types/language.ts (new file)

/** Supported app languages */
export type AppLanguage = "en" | "pl";

/** All supported languages for iteration */
export const APP_LANGUAGES: ReadonlyArray<AppLanguage> = ["en", "pl"] as const;

/** Display names as endonyms (each language in its own name) */
export const LANGUAGE_DISPLAY_NAMES: Record<AppLanguage, string> = {
  en: "English",
  pl: "Polski",
};
```

Language display names are always shown in the target language itself (endonyms), regardless of the current UI language. This is standard practice for language selectors — "Polski" is always "Polski", not "Polish".

### 2. User Preferences

```typescript
// lib/repositories/preferences.ts (new file)

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

Default for both is `"en"` if no stored value exists. Uses the app's existing `lib/storage/` abstraction (file-system on native, localforage on web) — the same storage layer used by `SourceRepository`, `TagsRepository`, and `RecipeRepository`. Uses separate storage keys (not a single JSON blob) so each preference can be read/written independently.

### 3. Preferences Context

```typescript
// features/settings/context/PreferencesContext.tsx (new file)

interface PreferencesContextValue {
  uiLanguage: AppLanguage;
  ocrLanguage: AppLanguage;
  setUiLanguage: (lang: AppLanguage) => Promise<void>;
  setOcrLanguage: (lang: AppLanguage) => Promise<void>;
}
```

**Provider placement** in `app/_layout.tsx`. The current chain is:

```
GestureHandlerRootView
  Suspense
    DebugProvider
      SourcesProvider
        TagsProvider
          RecipesProvider
            ICloudSyncProvider
              BackgroundProcessingProvider
                Stack
                WebViewSetup
```

The new chain inserts `PreferencesProvider` between `Suspense` and `DebugProvider`:

```
GestureHandlerRootView
  Suspense
    PreferencesProvider           ← new
      DebugProvider
        SourcesProvider
          TagsProvider
            RecipesProvider
              ICloudSyncProvider
                BackgroundProcessingProvider
                  Stack
                  WebViewSetup
```

`PreferencesProvider` must wrap all other providers because:
- `SourcesProvider` needs `ocrLanguage` for defaulting new book language
- `BackgroundProcessingProvider` needs book language for OCR processing
- All providers and screens need `uiLanguage` for rendering

On `setUiLanguage`, the provider also calls `i18n.changeLanguage(lang)` to switch all i18next translations immediately.

On mount, the provider reads stored preferences and calls `i18n.changeLanguage(storedUiLanguage)` before rendering children (using React 19 `use()` for the initial async load, same pattern as `SourcesProvider`).

### 4. Source (Book) Language Property

```typescript
// lib/types/source.ts — updated
import type { SourceId } from "./primitives";
import type { AppLanguage } from "./language";

export interface Source {
  id: SourceId;
  name: string;
  language: AppLanguage;
  lastUsedAt: number;
}
```

The `language` field is required. All books created in this version must have an explicit language.

**Source repository changes** (`lib/repositories/sources.ts`):

- `create(name: string, language: AppLanguage)` — now accepts `language` parameter
- `setLanguage(id: SourceId, language: AppLanguage)` — new method, updates language field
- `getAll()` — add defensive default: `sources.map(s => ({ ...s, language: s.language ?? "en" }))` to handle any serialized data missing the field

**SourcesContext changes** (`features/sources/context/SourcesContext.tsx`):

The context's `createSource` wraps the repository call and injects the default language from preferences:

```typescript
// SourcesContext now depends on PreferencesContext
const { ocrLanguage } = usePreferences();

const createSource = useCallback(async (name: string, language?: AppLanguage): Promise<Source> => {
  const lang = language ?? ocrLanguage;
  const newSource = await sourceRepository.create(name, lang);
  setSources(prev => [...prev, newSource]);
  return newSource;
}, [ocrLanguage]);
```

The `language` parameter is optional in the context method. When omitted (as in the SourceSelector's "Add Book" flow), it defaults to the user's preferred OCR language. When provided explicitly (as in the manage-books "Set Language" action), it uses the given value.

**Callers that create books** — no signature changes needed at call sites:
- `SourceSelector` "Add Book" flow → calls `createSource(name)` → defaults to `ocrLanguage`
- Manage books "Add Book" → calls `createSource(name)` → defaults to `ocrLanguage`
- First book flow in `AddRecipeForm` → calls `createSource(name)` → defaults to `ocrLanguage`

### 5. Recipe "Manually Touched" Tracking

To support reprocessing rules, we need to know whether a user has manually edited a recipe's title or tags.

```typescript
// lib/types/recipe.ts — updated
export interface Recipe {
  id: RecipeId;
  photoUri: PhotoUri;
  thumbnailUri?: PhotoUri;
  originalPhotoUri?: PhotoUri;
  timestamp: number;
  metadata: RecipeMetadata;
  recognizedText?: string;
  status: "pending" | "processing" | "ready";
  manuallyEdited?: boolean;  // new: true if user edited title or tags
}

export interface RecipeMetadata {
  title?: string;
  source?: SourceId | `https://${string}` | `http://${string}`;
  tagIds: Array<TagId>;  // References Tag entities by ID
}
```

**When to set `manuallyEdited`:**
- `RecipesContext.updateRecipe(id, metadata)` — this is the path for user-initiated edits from the recipe edit form. Compare incoming `title`/`tagIds` against current values. If either changed, set `manuallyEdited: true`.

**When NOT to set it:**
- `updateComplete(id, ...)` — this is the background processing path. Never sets `manuallyEdited`.

A simple boolean is sufficient because:
- We only need to know "was it touched?" not "which fields were touched"
- Once manually edited, a recipe stays excluded from auto-reprocessing permanently
- No need for a more complex diff or field-level tracking

### 6. OCR Language Support

#### Web (Tesseract.js)

```typescript
// lib/photo-processor/ocr-bridge/index.web.ts — updated

import type { AppLanguage } from "@/lib/types/language";

const TESSERACT_LANGUAGE_MAP: Record<AppLanguage, string> = {
  en: "eng",
  pl: "pol",
};

let worker: Worker | null = null;
let currentLang: string | null = null;

export async function extractText(
  imageUri: DataUrl,
  language: AppLanguage = "en"
): Promise<OcrResult> {
  const tessLang = TESSERACT_LANGUAGE_MAP[language] ?? "eng";

  // Reinitialize worker if language changed
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

Tesseract.js downloads language data on demand. The `"pol"` language pack is fetched from the Tesseract CDN when first used. This is a one-time ~4 MB download.

#### Native (expo-text-extractor)

The native OCR bridge (`index.native.ts`) requires **no changes**. Both Apple Vision (iOS) and ML Kit (Android) automatically detect all Latin-script languages, including Polish with diacritics (ą, ć, ę, ł, ń, ó, ś, ź, ż). The existing `extractTextFromImage(imageUri)` call works for Polish text out of the box.

The `language` parameter is only needed for the web/Tesseract.js bridge, where the language model must be explicitly loaded. The native bridge signature remains unchanged:

```typescript
// lib/photo-processor/ocr-bridge/index.native.ts — NO CHANGES needed
export async function extractText(imageUri: DataUrl): Promise<OcrResult> {
  const textBlocks = await extractTextFromImage(imageUri);
  // ... rest unchanged
}
```

#### Pipeline Integration

The language parameter must flow through the full call chain. Currently:

```
processPhoto(photoUri, config)
  → processTextRecognition(ocrImageDataUrl)        // no language
    → extractText(imageDataUrl)                     // no language
```

Updated chain:

```
processPhoto(photoUri, config)                      // config.ocr.language
  → processTextRecognition(ocrImageDataUrl, language)
    → extractText(imageDataUrl, language)
```

**Changes required at each layer:**

```typescript
// lib/photo-processor/types.ts — updated config
ocr: {
  enabled: boolean;
  language?: AppLanguage;  // new
}
```

```typescript
// lib/photo-processor/pipelines/text-recognition/text-recognition-pipeline.ts — updated
export async function processTextRecognition(
  imageDataUrl: DataUrl,
  language?: AppLanguage            // new parameter
): Promise<TextRecognitionResult> {
  const ocrResult = await extractText(imageDataUrl, language);
  // ... rest unchanged
}
```

```typescript
// lib/photo-processor/index.ts — updated (inside processPhoto)
if (config.ocr.enabled) {
  const textRecResult = await processTextRecognition(
    ocrImageDataUrl,
    config.ocr.language              // forward language from config
  );
  // ...
}
```

```typescript
// lib/photo-processor/ocr-bridge/index.d.ts — updated type declaration
export function extractText(
  imageUri: DataUrl,
  language?: AppLanguage
): Promise<OcrResult>;
```

The native bridge (`index.native.ts`) ignores the `language` parameter (auto-detects all Latin scripts). The web bridge (`index.web.ts`) uses it to select the Tesseract language model. Both satisfy the same `extractText` signature.

The language flows from: `Source.language` → `BackgroundProcessingContext` → `PhotoAdjustmentConfig.ocr.language` → `processPhoto()` → `processTextRecognition()` → `extractText()`.

### 7. Tag Localization System

#### Current Tag Architecture

Tags are first-class entities managed by `TagsRepository` and exposed via `TagsContext`:

```typescript
// lib/types/tag.ts
interface Tag {
  id: TagId;                  // UUID string
  label: `#${string}`;        // Canonical label with # prefix (e.g., "#pasta")
  normalizedLabel: string;    // Lowercase without # (e.g., "pasta")
  recipeCount: number;        // Denormalized usage count
  lastUsedAt: number;         // For sorting/frecency
}
```

Recipes reference tags by ID (`tagIds: Array<TagId>`). Tags are auto-created by the repository when the classifier suggests new labels during background processing. The `TagsContext` provides a `tagLookup: Map<TagId, Tag>` for O(1) resolution.

#### Localization Approach

Tag labels remain stored in canonical English form (`#pasta`, `#italian`, `#whole_year`). Localization is purely a display-time concern — a static mapping translates `tag.normalizedLabel` to the user's UI language.

#### Localized Display Labels

```typescript
// features/tags/utils/tagDisplayLabels.ts (new file)

import type { AppLanguage } from "@/lib/types/language";
import type { LabelKey } from "@/lib/text-classifier/labels";

/**
 * Display labels for known tags, per language.
 * Used at render time to show tags in the user's UI language.
 * Tags not in this map display their canonical label as-is (e.g., user-created tags).
 */
export const TAG_DISPLAY_LABELS: Record<LabelKey, Record<AppLanguage, string>> = {
  // Seasons
  whole_year: { en: "Year-round", pl: "Cały rok" },
  spring: { en: "Spring", pl: "Wiosna" },
  summer: { en: "Summer", pl: "Lato" },
  autumn: { en: "Autumn", pl: "Jesień" },
  winter: { en: "Winter", pl: "Zima" },

  // Cuisines
  italian: { en: "Italian", pl: "Włoskie" },
  french: { en: "French", pl: "Francuskie" },
  spanish: { en: "Spanish", pl: "Hiszpańskie" },
  greek: { en: "Greek", pl: "Greckie" },
  mediterranean: { en: "Mediterranean", pl: "Śródziemnomorskie" },
  german: { en: "German", pl: "Niemieckie" },
  british: { en: "British", pl: "Brytyjskie" },
  polish: { en: "Polish", pl: "Polskie" },
  ukrainian: { en: "Ukrainian", pl: "Ukraińskie" },
  eastern_european: { en: "Eastern European", pl: "Wschodnioeuropejskie" },
  balkan: { en: "Balkan", pl: "Bałkańskie" },
  caucasus: { en: "Caucasian", pl: "Kaukaskie" },
  scandinavian: { en: "Scandinavian", pl: "Skandynawskie" },
  chinese: { en: "Chinese", pl: "Chińskie" },
  japanese: { en: "Japanese", pl: "Japońskie" },
  korean: { en: "Korean", pl: "Koreańskie" },
  thai: { en: "Thai", pl: "Tajskie" },
  vietnamese: { en: "Vietnamese", pl: "Wietnamskie" },
  southeast_asian: { en: "Southeast Asian", pl: "Południowoazjatyckie" },
  indian: { en: "Indian", pl: "Indyjskie" },
  nepalese: { en: "Nepalese", pl: "Nepalskie" },
  turkish: { en: "Turkish", pl: "Tureckie" },
  lebanese: { en: "Lebanese", pl: "Libańskie" },
  persian: { en: "Persian", pl: "Perskie" },
  israeli: { en: "Israeli", pl: "Izraelskie" },
  middle_eastern: { en: "Middle Eastern", pl: "Bliskowschodnie" },
  central_asian: { en: "Central Asian", pl: "Środkowoazjatyckie" },
  moroccan: { en: "Moroccan", pl: "Marokańskie" },
  north_african: { en: "North African", pl: "Północnoafrykańskie" },
  egyptian: { en: "Egyptian", pl: "Egipskie" },
  west_african: { en: "West African", pl: "Zachodnioafrykańskie" },
  east_african: { en: "East African", pl: "Wschodnioafrykańskie" },
  southern_african: { en: "Southern African", pl: "Południowoafrykańskie" },
  mexican: { en: "Mexican", pl: "Meksykańskie" },
  peruvian: { en: "Peruvian", pl: "Peruwiańskie" },
  argentinian: { en: "Argentinian", pl: "Argentyńskie" },
  brazilian: { en: "Brazilian", pl: "Brazylijskie" },
  latin_american: { en: "Latin American", pl: "Latynoamerykańskie" },
  american: { en: "American", pl: "Amerykańskie" },
  cajun: { en: "Cajun", pl: "Cajun" },
  caribbean: { en: "Caribbean", pl: "Karaibskie" },

  // Food categories
  appetizer: { en: "Appetizer", pl: "Przystawka" },
  soup: { en: "Soup", pl: "Zupa" },
  salad: { en: "Salad", pl: "Sałatka" },
  pasta: { en: "Pasta", pl: "Makaron" },
  pizza: { en: "Pizza", pl: "Pizza" },
  rice: { en: "Rice", pl: "Ryż" },
  stew: { en: "Stew", pl: "Gulasz" },
  roast: { en: "Roast", pl: "Pieczeń" },
  grill: { en: "Grill", pl: "Grill" },
  "stir-fry": { en: "Stir-fry", pl: "Stir-fry" },
  baked: { en: "Baked", pl: "Zapiekanka" },
  pastry: { en: "Pastry", pl: "Ciasto" },
  dessert: { en: "Dessert", pl: "Deser" },
  beverage: { en: "Beverage", pl: "Napój" },
  preserves: { en: "Preserves", pl: "Przetwory" },
};
```

#### Tag Display Resolution

The existing `resolveRecipeTags.ts` utility resolves `TagId` → `Tag` → display labels. It needs a localized variant:

```typescript
// features/tags/utils/resolveRecipeTags.ts — new export

import { TAG_DISPLAY_LABELS } from "./tagDisplayLabels";
import type { AppLanguage } from "@/lib/types/language";
import type { LabelKey } from "@/lib/text-classifier/labels";

/**
 * Resolve TagIds to localized display labels for the given UI language.
 * Falls back to the canonical tag label for user-created tags not in the display map.
 */
export function resolveLocalizedTagLabels(
  tagIds: Array<TagId>,
  lookup: Map<TagId, Tag>,
  language: AppLanguage
): Array<string> {
  return tagIds.map((id) => {
    const tag = lookup.get(id);
    if (!tag) return id;
    const localizedLabel = TAG_DISPLAY_LABELS[tag.normalizedLabel as LabelKey];
    if (localizedLabel) {
      return localizedLabel[language] ?? tag.normalizedLabel;
    }
    return tag.normalizedLabel;
  });
}
```

#### Tag Display: Call-Site Localization

The generic atom components (`TagList`, `TagInput`, `GlassLikeTagInput`) receive `Array<string>` — raw `#`-prefixed labels. They are **not modified**. Localization happens at the **call sites** that prepare tag data for these components.

**Helper function** (placed in `features/tags/utils/tagDisplayLabels.ts`):

```typescript
// Resolve a Tag to its localized display string
export function getTagDisplayLabel(tag: Tag, uiLanguage: AppLanguage): string {
  const labels = TAG_DISPLAY_LABELS[tag.normalizedLabel as LabelKey];
  if (labels) {
    return `#${labels[uiLanguage] ?? tag.normalizedLabel}`;
  }
  return tag.label; // User-created tags: show as-is
}
```

**Call sites that need updating:**

| Call site | Current behavior | Change |
|-----------|-----------------|--------|
| `MetadataFormFields.tsx` | Passes `RecipeMetadataWrite.tags` (canonical `#`-prefixed strings) to `GlassLikeTagInput` | Convert to localized display strings before passing; convert back to canonical on `onChange` |
| Recipe card/detail (wherever `resolveTagLabels()` is called) | Returns canonical `tag.label` strings | Use `resolveLocalizedTagLabels()` instead, passing `uiLanguage` |
| `useTagSuggestions.ts` | Returns `tag.normalizedLabel` (without `#`) as `TagSuggestion.label` | Return localized label via `getTagDisplayLabel()` |
| `SearchBar.tsx` suggestion display | Shows `suggestion.label` directly | No change needed — `useTagSuggestions` now returns localized labels |

The `uiLanguage` comes from `usePreferences()` at each call site.

**Key principle**: Tags created by the classifier use canonical English keys from `labels.ts`, so they always match `TAG_DISPLAY_LABELS`. Tags created manually by the user (custom tags like `#babciny-przepis`) won't be in the map and display as-is — this is correct behavior.

### 8. Polish Classification Keywords

To improve classification accuracy for Polish-language OCR text, add Polish keyword variants to the label descriptions in `lib/text-classifier/labels.ts`. This benefits both the TF-IDF classifier and embedding-based classifier.

```typescript
// Example additions to SEASON_LABELS
whole_year:
  "all-season, year-round, everyday cooking, ..., cały rok, codzienne, szybkie, obiad, kolacja, śniadanie, makaron, chleb, zupa",
spring:
  "fresh vegetables, asparagus, ..., wiosna, szparagi, rzodkiewka, rabarbar, szczypiorek, świeże warzywa",
```

Each label gets Polish keywords appended to its description string. This is the minimal change — the classification algorithms already tokenize on whitespace/commas, so mixed-language descriptions work naturally.

### 9. Search Normalization

The search system has two components:

1. **Free-text fuzzy search** (`filterRecipes` / `filterRecipesWithQuery` in `features/recipes-list/utils/recipeSearch.ts`) — uses microfuzz against recipe title + resolved tag text
2. **Tag suggestions** (`features/search/hooks/useTagSuggestions.ts`) — prefix-match against `tag.normalizedLabel` with recipe count

Both currently resolve tags via `resolveNormalizedTagTexts()`, which returns the English `normalizedLabel` (e.g., `"pasta"`, `"soup"`). For Polish support, the search index needs to include localized tag labels in all languages.

#### Updated `resolveNormalizedTagTexts`

The existing utility in `features/tags/utils/resolveRecipeTags.ts` returns `[tag.normalizedLabel]` per tag. Expand it to include all language variants:

```typescript
// features/tags/utils/resolveRecipeTags.ts — updated

import { TAG_DISPLAY_LABELS } from "./tagDisplayLabels";
import type { LabelKey } from "@/lib/text-classifier/labels";

/**
 * Resolve TagIds to normalized search text including all language variants.
 * Used by fuzzy search to match both "soup" and "zupa" against the same tag.
 */
export function resolveNormalizedTagTexts(
  tagIds: Array<TagId>,
  lookup: Map<TagId, Tag>
): Array<string> {
  return tagIds.flatMap((id) => {
    const tag = lookup.get(id);
    if (!tag) return [];
    const labels = TAG_DISPLAY_LABELS[tag.normalizedLabel as LabelKey];
    if (labels) {
      // Include canonical key + all localized variants
      return [tag.normalizedLabel, ...Object.values(labels).map((l) => l.toLowerCase())];
    }
    return [tag.normalizedLabel];
  });
}
```

This means typing "zupa" (Polish) matches recipes tagged `#soup`, and "soup" (English) also matches. Both `filterRecipes` and `filterRecipesWithQuery` benefit automatically since they call `resolveNormalizedTagTexts`.

#### Tag Suggestions

The `useTagSuggestions` hook filters `tags` by prefix against `tag.normalizedLabel`. For Polish support, it should also match against localized labels:

```typescript
// features/search/hooks/useTagSuggestions.ts — updated matching logic
const matchesPrefix = (tag: Tag, prefix: string): boolean => {
  if (tag.normalizedLabel.startsWith(prefix)) return true;
  const labels = TAG_DISPLAY_LABELS[tag.normalizedLabel as LabelKey];
  if (labels) {
    return Object.values(labels).some((l) => l.toLowerCase().startsWith(prefix));
  }
  return false;
};
```

This way, typing "zu" shows `#soup` as a suggestion (because "zupa" starts with "zu").

This means typing "zupa" (Polish for soup) matches recipes tagged `#soup`, and typing "soup" also matches. Both directions work without the user needing to know the canonical tag ID.

### 10. Settings Screen

**Route:** `app/settings.tsx` (new file)

#### Layout

```
┌──────────────────────────────────┐
│            Settings              │
├──────────────────────────────────┤
│                                  │
│  UI Language                     │
│  ┌────────────────────────────┐  │
│  │  English  📱               │  │ ← phone icon = OS language
│  │  Polski                    │  │
│  └────────────────────────────┘  │
│                                  │
│  OCR Language                    │
│  ┌────────────────────────────┐  │
│  │  English                   │  │
│  │  Polski   📱               │  │ ← if OS is Polish
│  └────────────────────────────┘  │
│                                  │
│                                  │
│  (←)                             │  ← back button
└──────────────────────────────────┘
```

Each section has:
- A section header (localized: "UI Language" / "OCR Language")
- A list of options, each a pressable row with a radio indicator
- The selected option is highlighted
- A phone icon (SF Symbol `iphone` / MaterialIcons `phone-iphone`) appears next to the option matching the OS language

#### Phone Icon Logic

```typescript
import * as Localization from "expo-localization";

const osLanguage = Localization.getLocales()[0]?.languageCode;
// Show phone icon next to "English" if osLanguage === "en"
// Show phone icon next to "Polski" if osLanguage === "pl"
// Show no phone icon if osLanguage is neither
```

#### i18n Integration

When the user selects a UI language:
1. `setUiLanguage(lang)` persists to AsyncStorage
2. `i18n.changeLanguage(lang)` updates all translated strings
3. React re-renders with new translations (react-i18next handles this automatically via its context)

This is immediate — no app restart needed.

### 11. Book Language in Manage Books Screen

The manage-books screen (`app/manage-books.tsx`) gains a new "Set language" action on the left side alongside "Edit".

#### Updated Swipe Actions

Currently, swiping right reveals one action button (Edit, `ACTION_BUTTON_WIDTH = 80`). The spec requires two left-side actions (Edit + Set Language).

```
┌──────────────────────────────────────────────────┐
│  [🌐]  [✏️]  │  Book Name                        │
│  Lang   Edit  │  5 recipes · EN                   │
└──────────────────────────────────────────────────┘
```

**Gesture math changes** for two left-side buttons:

The existing `SwipeableBookRow` uses `ACTION_BUTTON_WIDTH = 80` for a single button. With two buttons, the total reveal width doubles to `ACTION_BUTTON_WIDTH * 2 = 160`. Changes needed:

- `SWIPE_THRESHOLD` for left-side reveal increases to accommodate two buttons
- The `translateX` limit (`ACTION_BUTTON_WIDTH * 1.5`) becomes `ACTION_BUTTON_WIDTH * 2 * 1.5`
- The edit button container's `left` offset accounts for the globe button's width
- Each button uses `useActionButtonScale` with adjusted thresholds for its position
- On swipe end, the snap target is `ACTION_BUTTON_WIDTH * 2` (both buttons revealed) instead of `ACTION_BUTTON_WIDTH`

**Button definitions:**

- **Globe button** (left-most): gray styling, opens language picker for the book
  - Icon: `language` SF Symbol (Apple's globe icon) / MaterialIcons `language`
  - Color: gray (`#8E8E93`)
  - Label: `t("manageBooks.setLanguageAction")`
  - Pressing it shows a language selection via `Alert.alert` with two buttons: "English" and "Polski"
- **Edit button** (next to globe): blue styling, enters edit mode (existing behavior, unchanged)

The recipe count subtitle also shows the book's current language: `"5 recipes · EN"` or `"5 recipes · PL"`.

**Alternative (simpler) approach:** If fitting two buttons in the left swipe area proves too crowded, the book language can instead be shown as a tappable "EN" / "PL" badge in the row itself (always visible, no swipe needed) that opens the language picker on tap. This avoids gesture math changes entirely.

#### Language Selection Interaction

When the user taps the globe button:
1. An action sheet or inline picker appears with two options: "English" and "Polski"
2. Selecting a language calls `sourceRepository.setLanguage(sourceId, language)`
3. If the language changed, triggers reprocessing of untouched recipes from that book

#### Reprocessing Trigger

```typescript
// In manage-books screen or a dedicated hook
async function handleSetLanguage(sourceId: SourceId, newLanguage: AppLanguage) {
  const source = sources.find((s) => s.id === sourceId);
  if (!source || source.language === newLanguage) return;

  await setSourceLanguage(sourceId, newLanguage);

  // Find untouched recipes from this book
  const bookRecipes = recipes.filter(
    (r) => r.metadata.source === sourceId && !r.manuallyEdited && r.status === "ready"
  );

  // Re-queue them for processing
  for (const recipe of bookRecipes) {
    addToQueue(recipe.id);
  }
}
```

### 12. Background Processing Updates

`BackgroundProcessingContext.processRecipe()` needs to read the book language and pass it through the processing pipeline:

```typescript
// In processRecipe(recipeId):
const recipe = await recipeRepository.getById(recipeId);
const sourceId = recipe.metadata.source;
let bookLanguage: AppLanguage = "en";
if (sourceId && !isUrl(sourceId)) {
  const source = await sourceRepository.getById(sourceId);
  bookLanguage = source?.language ?? "en";
}

const result = await processPhoto(photoDataUrl, {
  ...DEFAULT_CONFIG,
  // ...existing config...
  ocr: {
    enabled: true,
    language: bookLanguage,
  },
});
```

The language flows through: `Source.language` → `PhotoAdjustmentConfig.ocr.language` → `text-recognition-pipeline` → `extractText(imageUri, language)`.

### 13. i18n: Polish Translation File

Create `platform/i18n/translations/pl.json` with all keys from `en.json` translated to Polish.

```json
{
  "emptyState": {
    "title": "Brak przepisów",
    "instruction": "Naciśnij przycisk poniżej, aby dodać pierwszy przepis"
  },
  "addRecipe": {
    "button": "Dodaj przepis",
    "camera": "Zrób zdjęcie",
    "library": "Wybierz z biblioteki"
  },
  "recipeForm": {
    "title": {
      "label": "Tytuł",
      "placeholder": "Nazwa przepisu"
    },
    "source": {
      "label": "Źródło",
      "placeholder": "URL lub nazwa książki"
    },
    "tags": {
      "label": "Tagi",
      "placeholder": "Dodaj tagi..."
    },
    "submit": "Wybierz książkę",
    "submitEdit": "Zapisz zmiany",
    "discardChanges": {
      "title": "Odrzucić zmiany?",
      "message": "Masz niezapisane zmiany. Czy na pewno chcesz je odrzucić?",
      "cancel": "Anuluj",
      "discard": "Odrzuć"
    }
  },
  "recipeMetadata": {
    "emptyState": "Brak dodatkowych szczegółów"
  },
  "search": {
    "placeholder": "Szukaj przepisów...",
    "selectedPill": {
      "accessibilityLabel": "Wybrany tag #{{tag}}"
    },
    "suggestions": {
      "accessibilityLabel_one": "#{{tag}}, {{countLabel}} przepis",
      "accessibilityLabel_few": "#{{tag}}, {{countLabel}} przepisy",
      "accessibilityLabel_many": "#{{tag}}, {{countLabel}} przepisów"
    }
  },
  "accessibility": {
    "close": "Zamknij",
    "removeTag": "Usuń tag",
    "back": "Wróć",
    "delete": "Usuń przepis",
    "confirm": "Potwierdź",
    "moreOptions": "Więcej opcji"
  },
  "deleteRecipe": {
    "title": "Usunąć przepis?",
    "message": "Tej operacji nie można cofnąć.",
    "cancel": "Anuluj",
    "confirm": "Usuń"
  },
  "errors": {
    "permissionDenied": "Odmówiono dostępu do kamery lub zdjęć",
    "importFailed": "Nie udało się zaimportować przepisu",
    "saveFailed": "Nie udało się zapisać przepisu",
    "loadFailed": "Nie udało się wczytać przepisu",
    "invalidTags": "Tagi muszą zaczynać się od # i nie mogą zawierać spacji"
  },
  "sourceSelector": {
    "label": "Książka",
    "placeholder": "Wybierz książkę",
    "addNew": "Dodaj książkę",
    "addNewTitle": "Nowa książka",
    "addNewPlaceholder": "Wpisz tytuł książki"
  },
  "import": {
    "confirmHint": "Potwierdzanie za {seconds}s..."
  },
  "library": {
    "heading": "Twoje przepisy"
  },
  "menu": {
    "manageBooks": "Twoje książki",
    "about": "O aplikacji",
    "settings": "Ustawienia"
  },
  "manageBooks": {
    "title": "Twoje książki",
    "addBook": "Dodaj książkę",
    "emptyState": "Brak książek",
    "recipeCount_one": "{{count}} przepis",
    "recipeCount_few": "{{count}} przepisy",
    "recipeCount_many": "{{count}} przepisów",
    "back": "Wróć",
    "editAction": "Edytuj",
    "confirmEditAction": "Gotowe",
    "setLanguageAction": "Język",
    "deleteConfirmTitle": "Usunąć „{{name}}"?",
    "deleteConfirmMessage": "Tej operacji nie można cofnąć. Wszystkie przepisy ({{count}}) zaimportowane z tej książki zostaną trwale usunięte.",
    "deleteConfirmCancel": "Anuluj",
    "deleteConfirmAction": "Usuń"
  },
  "settings": {
    "title": "Ustawienia",
    "uiLanguage": "Język interfejsu",
    "ocrLanguage": "Język rozpoznawania tekstu",
    "back": "Wróć"
  },
  "about": {
    "title": "O fasoli",
    "intro": "fasola to menedżer przepisów tworzony z pasją do oprogramowania, jedzenia i książek.",
    "onDevice": "Twoje dane zostają na Twoim urządzeniu — bez chmury, bez kont.",
    "openSource": "Aplikacja jest open-source.",
    "githubLink": "Zobacz źródło na GitHubie",
    "author": "Autor",
    "authorEmail": "eryk.napierala@gmail.com",
    "authorCopyright": "© 2026 Eryk Napierała",
    "authorBio": "Twórca produktów z Wrocławia. Żonaty z entuzjastką gotowania, która miała dość zakładek z przepisami.",
    "getHelp": "Pomoc",
    "helpText1": "Masz pomysł na funkcję, znalazłeś błąd lub po prostu chcesz się przywitać? Chętnie usłyszę!",
    "helpText2": "Wyślij mi e-mail!",
    "helpCta": "Wyślij opinię"
  },
  "processing": {
    "messages": {
      "first": "Analizuję stronę...",
      "m1": "Rozszyfrowuję pismo babci...",
      "m2": "Czytam między wierszami...",
      "m3": "Wypatruję sekretnego składnika...",
      "m4": "Liczę szczypty soli...",
      "m5": "Tłumaczę skróty kucharza...",
      "m6": "Oddzielam ziarno od plew...",
      "m7": "Przesiewam mąkę ze słów...",
      "m8": "Smakuję literki...",
      "m9": "Pozwalam słowom się zagotować...",
      "m10": "Łowię nazwę przepisu..."
    }
  }
}
```

Note: Polish pluralization uses three forms, handled by i18next v4 with `compatibilityJSON: "v4"`. The rules are:

| Count | Form | Example | Rule |
|-------|------|---------|------|
| 0 | `_many` | "0 przepisów" | Zero always uses `_many` |
| 1 | `_one` | "1 przepis" | Exactly 1 |
| 2-4 | `_few` | "3 przepisy" | Ends in 2-4, except 12-14 |
| 5-21 | `_many` | "5 przepisów" | Ends in 0, 1, or 5-9, or 12-14 |
| 22-24 | `_few` | "22 przepisy" | Ends in 2-4, except 12-14 |
| 25-31 | `_many` | "25 przepisów" | Same as 5-21 rule |

The English translation only needs `_one` and `_other`.

Processing messages are translated to preserve the playful tone in Polish.

### 14. i18n Configuration Update

```typescript
// platform/i18n/config.ts — updated
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
  interpolation: {
    escapeValue: false,
  },
});
```

The initial `lng` is `"en"`. The `PreferencesProvider` reads the stored preference and calls `i18n.changeLanguage()` before rendering children, so the user never sees a flash of the wrong language.

Note: We no longer use `expo-localization` to auto-detect device language at init time. The language is always user-controlled via the stored preference.

### 15. Global Menu Update

The global menu (`features/recipes-list/hooks/useGlobalOptions.ts`) needs a new "Settings" entry:

```typescript
const options = useMemo<Array<MenuOption>>(
  () => [
    {
      id: "manage-books",
      label: t("menu.manageBooks"),
      systemImage: "books.vertical",
      route: "/manage-books",
    },
    {
      id: "settings",
      label: t("menu.settings"),
      systemImage: "gearshape",
      route: "/settings",
    },
    {
      id: "about",
      label: t("menu.about"),
      systemImage: "info.circle",
      route: "/about",
    },
  ],
  [t],
);
```

The `MenuOption` interface's `route` type union (currently `"/manage-books" | "/about"`) needs to include `"/settings"`:

```typescript
interface MenuOption {
  id: string;
  label: string;
  systemImage: string;
  route: "/manage-books" | "/about" | "/settings";
}
```

### 16. English Translation Additions

New keys to add to `en.json`:

```json
{
  "menu": {
    "settings": "Settings"
  },
  "manageBooks": {
    "setLanguageAction": "Language"
  },
  "settings": {
    "title": "Settings",
    "uiLanguage": "UI Language",
    "ocrLanguage": "OCR Language",
    "back": "Back"
  }
}
```

### File Changes

| File | Change |
|------|--------|
| `lib/types/language.ts` | **New file** — `AppLanguage` type, constants |
| `lib/types/source.ts` | Add `language: AppLanguage` field |
| `lib/types/recipe.ts` | Add `manuallyEdited?: boolean` field |
| `lib/repositories/preferences.ts` | **New file** — `PreferencesRepository` for UI/OCR language |
| `lib/repositories/sources.ts` | Add `language` param to `create()`, add `setLanguage()` method |
| `features/tags/utils/tagDisplayLabels.ts` | **New file** — `TAG_DISPLAY_LABELS` with en/pl labels per tag |
| `features/tags/utils/resolveRecipeTags.ts` | Expand `resolveNormalizedTagTexts` to include all language variants |
| `features/search/hooks/useTagSuggestions.ts` | Match tag suggestions against localized labels |
| `lib/text-classifier/labels.ts` | Append Polish keywords to label descriptions |
| `lib/photo-processor/types.ts` | Add `language?: AppLanguage` to OCR config |
| `lib/photo-processor/index.ts` | Forward `config.ocr.language` to `processTextRecognition()` |
| `lib/photo-processor/ocr-bridge/index.d.ts` | Update `extractText` type declaration with `language?` param |
| `lib/photo-processor/ocr-bridge/index.web.ts` | Add `language` parameter, language-to-Tesseract mapping, worker reinit |
| `lib/photo-processor/ocr-bridge/index.native.ts` | No changes needed — auto-detects Polish |
| `lib/photo-processor/pipelines/text-recognition/text-recognition-pipeline.ts` | Add `language` parameter, forward to `extractText()` |
| `features/recipe-form/components/MetadataFormFields.tsx` | Convert tags to/from localized display strings at the call site |
| `features/search/components/SearchBar.tsx` | No direct changes — benefits from localized `useTagSuggestions` output |
| `features/settings/context/PreferencesContext.tsx` | **New file** — `PreferencesProvider` and `usePreferences` hook |
| `features/recipes-list/utils/recipeSearch.ts` | No direct changes needed — benefits automatically from updated `resolveNormalizedTagTexts` |
| `features/recipes-list/hooks/useGlobalOptions.ts` | Add "Settings" menu entry |
| `features/recipes-list/context/RecipesContext.tsx` | Set `manuallyEdited: true` in `updateRecipe` when title/tagIds change |
| `features/sources/context/SourcesContext.tsx` | Add `setSourceLanguage()`, pass `ocrLanguage` as default for `createSource()` |
| `features/background-processing/context/BackgroundProcessingContext.tsx` | Read book language, pass through OCR config |
| `platform/i18n/config.ts` | Add `pl` resource bundle, remove auto-detect |
| `platform/i18n/translations/en.json` | Add `settings`, `menu.settings`, `manageBooks.setLanguageAction` keys |
| `platform/i18n/translations/pl.json` | **New file** — complete Polish translations |
| `app/settings.tsx` | **New file** — Settings screen with language selectors |
| `app/_layout.tsx` | Add `PreferencesProvider` to provider chain (outermost) |
| `app/manage-books.tsx` | Add globe button, language display, language change handler, reprocessing trigger |

## User Experience

### Flow: First Launch

1. App starts with English UI (default)
2. User navigates to Settings (via cog icon in global menu)
3. Selects "Polski" under UI Language → entire app switches to Polish immediately
4. Selects "Polski" under OCR Language → new books will default to Polish OCR

### Flow: Importing a Polish Recipe

1. User creates a new book (e.g., "Babcina kuchnia")
2. Book is created with `language: "pl"` (from preferred OCR language)
3. User imports a photo of a Polish recipe page
4. Background processing runs OCR with Polish language hints
5. Text classifier suggests tags like `#soup`, `#polish`, `#winter`
6. Tags display in Polish: `#Zupa`, `#Polskie`, `#Zima`

### Flow: Changing a Book's Language

1. In manage-books, user swipes right on "Italian Classics" (currently `en`)
2. Taps the globe button → selects "Polski"
3. Book language changes to `pl`
4. System checks for untouched recipes in the book
5. Untouched recipes are re-queued for processing with Polish OCR
6. Manually edited recipes remain unchanged

### Flow: Searching in Polish

1. User types "zupa" in the search bar
2. "zupa" matches `TAG_DISPLAY_LABELS.soup.pl` → resolves to canonical `#soup`
3. All recipes tagged `#soup` appear in results
4. Typing "soup" also works (matches English label or canonical key)

## Testing Strategy

### Unit Tests

- **PreferencesRepository**: read/write UI language and OCR language; default to `"en"` when empty
- **Source.language**: create source with language, verify persisted correctly
- **Source.setLanguage**: update language, verify other fields unchanged
- **TAG_DISPLAY_LABELS completeness**: every key in `ALL_LABELS` has an entry in `TAG_DISPLAY_LABELS` with both `en` and `pl`; verify no label is blank or missing
- **Tag localization**: given a Tag with `normalizedLabel: "pasta"` and UI language `pl`, `resolveLocalizedTagLabels` returns `"Makaron"`; with `en`, returns `"Pasta"`; user-created tag `#babciny` returns `"babciny"` unchanged
- **Search normalization**: `resolveNormalizedTagTexts` for a tag with `normalizedLabel: "soup"` returns `["soup", "soup", "zupa"]`; `filterRecipes` with term `"zupa"` matches recipe tagged with soup TagId; `filterRecipes` with `"soup"` also matches
- **Tag suggestions**: `useTagSuggestions` with prefix `"zu"` matches tag with `normalizedLabel: "soup"` (because "zupa" starts with "zu")
- **OCR language mapping**: web bridge maps `"en"` → `"eng"`, `"pl"` → `"pol"`; unknown language falls back to `"eng"`
- **manuallyEdited tracking**: updating a recipe title sets `manuallyEdited: true`; updating tagIds sets it; background processing completion does not set it; recipes with `manuallyEdited: true` are excluded from reprocessing
- **Polish pluralization**: `t("manageBooks.recipeCount", { count: 1 })` → "1 przepis"; `count: 3` → "3 przepisy"; `count: 5` → "5 przepisów"

### Integration Tests

- Change UI language to Polish → verify all visible strings updated (spot-check key screens)
- Create book with preferred OCR language set to Polish → verify `book.language === "pl"`
- Process a recipe from a Polish book → verify OCR bridge called with `language: "pl"`
- Change book language from `en` to `pl` → verify untouched recipes are re-queued
- Change book language → verify manually edited recipes are NOT re-queued
- Search with Polish term → verify results include correct canonical-tagged recipes

### Manual / iOS Simulator Testing

- Settings screen accessible via cog icon in overflow menu
- Both language selectors functional; phone icon appears next to system language
- Switching UI language updates all screens without restart
- Creating a book reflects the preferred OCR language
- Globe button visible on manage-books swipe, gray styling
- Language selection for a book triggers visible reprocessing of untouched recipes
- Polish OCR on a Polish recipe page produces reasonable text (compare with English OCR on same page)
- Tag display shows Polish labels when UI is Polish, English labels when English
- Search works with both Polish and English tag terms

## Performance Considerations

- **Translation file size**: Polish JSON is ~3 KB. Loaded eagerly at startup via i18n resource bundle. Negligible.
- **Tag label lookup**: `TAG_DISPLAY_LABELS` is a flat object keyed by label key. O(1) lookup per tag per render. No computation overhead.
- **Search index expansion**: Each tag now generates 3-4 search terms instead of 1 (canonical key + en label + pl label). For typical recipe counts (<1000 recipes, <5 tags each), microfuzz handles this without perceptible slowdown.
- **OCR language switching**: Tesseract.js worker must be recreated when the language changes (different model data). This adds ~2s latency on the first Polish OCR. Subsequent Polish OCR reuses the worker. The language data (~4 MB for `pol`) is cached by the browser.
- **Reprocessing**: When book language changes, only untouched recipes are reprocessed. Processing happens sequentially in the existing background queue. For a book with 50 recipes, reprocessing may take several minutes but runs without blocking the UI.

## Security Considerations

None. All data is local. No network calls except Tesseract.js downloading language data from its CDN (same CDN already used for English data). No user-generated content rendered as HTML.

## Documentation

- Update `docs/architecture.md` to document:
  - `AppLanguage` type and `language.ts` module
  - `PreferencesRepository` and `PreferencesContext`
  - `Source.language` field
  - `Recipe.manuallyEdited` field
  - Tag localization system (`tag-labels.ts`, `useTagLabel`)
  - Settings screen route
- Update `docs/commands.md` if any new dev/test commands arise

## Implementation Phases

### Phase 1: Language Types + Preferences

1. Create `lib/types/language.ts` with `AppLanguage` type and constants
2. Create `lib/repositories/preferences.ts` with `PreferencesRepository`
3. Create `features/settings/context/PreferencesContext.tsx` with provider and hook
4. Add `PreferencesProvider` to `app/_layout.tsx` provider chain (outermost)
5. Create `platform/i18n/translations/pl.json` with all translations
6. Update `platform/i18n/config.ts` to load Polish resource bundle
7. Add new English translation keys to `en.json`
8. Connect `PreferencesProvider` to `i18n.changeLanguage()` for UI language switching

### Phase 2: Settings Screen + Menu

1. Create `app/settings.tsx` with language selector sections
2. Implement phone icon indicator logic using `expo-localization`
3. Add "Settings" entry with cog icon to `useGlobalOptions.ts`
4. Update `MenuOption` route type to include `"/settings"`

### Phase 3: Book Language

1. Add `language: AppLanguage` to `Source` interface
2. Update `sourceRepository.create()` to accept language parameter
3. Add `sourceRepository.setLanguage()` method
4. Update `SourcesContext` to expose `setSourceLanguage()` and use `ocrLanguage` as default
5. Update all source creation call sites (source selector, manage books, first book flow)
6. Show book language in manage-books list item subtitle

### Phase 4: OCR Language Support

1. Add `language?: AppLanguage` to `PhotoAdjustmentConfig.ocr`
2. Update web OCR bridge (`index.web.ts`) with language parameter and worker reinit
3. Native OCR bridge (`index.native.ts`) — no changes needed (auto-detects Polish)
4. Update `index.d.ts` type declaration with optional `language` parameter
5. Update text-recognition pipeline to pass language from config
6. Update `BackgroundProcessingContext.processRecipe()` to read book language and pass it through

### Phase 5: Tag Localization + Search

1. Create `features/tags/utils/tagDisplayLabels.ts` with `TAG_DISPLAY_LABELS` and `getTagDisplayLabel()` helper
2. Update `resolveNormalizedTagTexts` in `resolveRecipeTags.ts` to include all language variants
3. Add `resolveLocalizedTagLabels` utility for display-time localization
4. Update call sites to use localized tag display:
   - `MetadataFormFields.tsx` — convert tags to/from localized display strings
   - Recipe card/detail views — use `resolveLocalizedTagLabels()` instead of `resolveTagLabels()`
5. Update `useTagSuggestions` to match and display against localized labels
6. Add Polish keywords to label descriptions in `labels.ts`

### Phase 6: Book Language UI + Reprocessing

1. Add `manuallyEdited?: boolean` to `Recipe` type
2. Update `RecipesContext.updateRecipe()` to set `manuallyEdited: true` when title/tagIds change
3. Add globe button to manage-books swipe actions (gray styling)
4. Implement language selection interaction on globe button press
5. Wire language change to reprocessing of untouched recipes via background queue

## Open Questions

1. ~~**expo-text-extractor language API**~~ **Resolved**: Both Apple Vision (iOS) and ML Kit (Android) auto-detect Latin-script languages including Polish. No API changes to `expo-text-extractor` are needed. The `language` parameter only applies to the web/Tesseract.js bridge.

2. **Tag input in Polish**: When a user manually types tags, they type canonical keys (e.g., `#pasta`). Should the tag input also accept localized names (e.g., typing "makaron" auto-resolves to `#pasta`)? The current spec doesn't require tag autocomplete, but input normalization could be a future enhancement.

3. **Tesseract.js Polish quality**: Tesseract.js OCR quality for Polish text (with diacritics like ą, ć, ę, ł, ń, ó, ś, ź, ż) should be tested. If quality is poor, consider falling back to native OCR or using a different web OCR engine.

4. **Two left-side swipe actions vs. inline badge**: The manage-books row currently supports one action per side. Adding a second left-side action (globe) requires significant gesture math changes. The simpler alternative — a tappable language badge always visible in the row — may be preferable. See Section 11 for both approaches.

## References

- `specs/018_language_pl/spec.md` — original feature request
- `specs/016_manage_books/spec.md` — manage books spec (source entity model)
- `platform/i18n/config.ts` — current i18n configuration
- `platform/i18n/translations/en.json` — English translation keys
- `lib/types/tag.ts` — Tag entity interface
- `lib/types/primitives.ts` — TagId, SourceId, RecipeId type aliases
- `lib/types/source.ts` — current Source interface
- `lib/types/recipe.ts` — current Recipe interface (uses `tagIds: Array<TagId>`)
- `lib/repositories/tags.ts` — TagsRepository with mutation logic
- `lib/text-classifier/labels.ts` — classification label definitions
- `lib/text-classifier/tfidf.ts` — TF-IDF classifier
- `lib/photo-processor/ocr-bridge/index.web.ts` — Tesseract.js OCR bridge
- `lib/photo-processor/ocr-bridge/index.native.ts` — native OCR bridge
- `lib/photo-processor/index.ts` — main `processPhoto()` entry point
- `lib/photo-processor/pipelines/text-recognition/text-recognition-pipeline.ts` — OCR pipeline stage
- `features/tags/context/TagsContext.tsx` — TagsProvider with tagLookup Map
- `features/tags/utils/resolveRecipeTags.ts` — TagId resolution utilities
- `features/search/hooks/useTagSuggestions.ts` — tag autocomplete in search
- `features/recipes-list/utils/recipeSearch.ts` — fuzzy search with tag-based filtering
- `features/recipes-list/hooks/useGlobalOptions.ts` — global menu options
- `features/background-processing/context/BackgroundProcessingContext.tsx` — processing queue
- `app/manage-books.tsx` — manage books screen
- `app/_layout.tsx` — provider chain (includes TagsProvider)
- [i18next pluralization rules](https://www.i18next.com/translation-function/plurals)
- [Tesseract.js language support](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html)
- [Apple Vision text recognition languages](https://developer.apple.com/documentation/vision/vnrecognizetextrequest)
