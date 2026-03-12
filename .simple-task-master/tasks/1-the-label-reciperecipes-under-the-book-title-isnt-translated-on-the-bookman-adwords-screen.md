---
schema: 1
id: 1
title: "The label Recipe/Recipes under the book title isn't translated on the Bookman AdWords screen. "
status: done
created: "2026-03-09T22:47:49.068Z"
updated: "2026-03-09T22:47:49.068Z"
tags:
  - bug
  - ui
  - translations
dependencies: []
---

## Implementation Plan

Now I have a complete picture. Let me write the implementation plan.

## Relevant Files
- **`app/manage-books.tsx`** (lines 314, 327) — The Manage Books screen; renders the recipe count label via `t("manageBooks.recipeCount", { count: recipeCount })`
- **`platform/i18n/translations/en.json`** (lines 88–89) — English translations with `recipeCount_one` / `recipeCount_other`
- **`platform/i18n/translations/pl.json`** (lines 89–91) — Polish translations with `recipeCount_one` / `recipeCount_few` / `recipeCount_many` but **missing `recipeCount_other`**
- **`platform/i18n/config.ts`** — i18next config with `compatibilityJSON: "v4"` (uses `Intl.PluralRules` for plural resolution)

## Analysis

The Manage Books screen correctly uses `t("manageBooks.recipeCount", { count: recipeCount })` to render the recipe count label under each book title. Both English and Polish translation files contain plural forms for this key.

However, the Polish translation is missing the `_other` suffix key. With `compatibilityJSON: "v4"`, i18next relies on `Intl.PluralRules` to determine which plural category to use. Polish CLDR rules define four categories: `one`, `few`, `many`, and `other`. While `other` should only apply to non-integer values (which recipe counts never are), the Hermes JS engine's `Intl.PluralRules` implementation may not fully conform to CLDR — it can resolve integer counts to `other` instead of the correct `few`/`many` category. When i18next looks for `recipeCount_other` in Polish and doesn't find it, it falls back to the `fallbackLng` ("en"), displaying "X recipe" or "X recipes" in English.

The same pattern affects `search.suggestions.accessibilityLabel` in pl.json (also missing `_other`), though that's an accessibility-only label and not the reported bug.

## Steps

1. **Add `recipeCount_other` to `pl.json`** under the `manageBooks` section. Use the `_many` form as the value since it's the most common/generic Polish plural:
   ```json
   "recipeCount_other": "{{count}} przepisów"
   ```
   Place it after `recipeCount_many` (line 91).

2. **Add `accessibilityLabel_other` to `pl.json`** under `search.suggestions` for consistency:
   ```json
   "accessibilityLabel_other": "#{{tag}}, {{countLabel}} przepisów"
   ```
   Place it after `accessibilityLabel_many` (line 43).

No changes needed to `manage-books.tsx` — the component code is already correct.

## Testing

1. Set the app's UI language to Polish (Settings → UI Language → Polski)
2. Navigate to the Manage Books screen (ellipsis menu → "Twoje książki")
3. Verify that the label under each book title shows Polish text:
   - 1 book recipe → "1 przepis"
   - 2–4 recipes → "X przepisy"
   - 5+ recipes → "X przepisów"
   - 0 recipes → "0 przepisów"
4. Switch back to English and verify "X recipe" / "X recipes" still works correctly
5. Verify the search tag suggestions also show Polish recipe counts when in Polish mode
