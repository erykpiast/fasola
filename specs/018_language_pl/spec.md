Let's introduce support for Polish language in the app.

It consists of two aspects:

1. UI language
2. OCR language

## Scope

V1 supports two languages: English (`en`) and Polish (`pl`).

The architecture should remain extensible for adding more languages later.

## UI language

The app should expose an explicit UI language selector with two options: English and Polish.

The selected UI language is user-controlled (there is no separate "System" option).

In the UI language selector:
- show a phone icon next to English when the OS language is English,
- show a phone icon next to Polish when the OS language is Polish,
- show no phone icon when the OS language is neither English nor Polish.

## OCR language

The app should expose a preferred OCR language selector with two options: English and Polish.

When creating a new book (from quick selector, first book flow, or manage books), the book language should default to current preferred OCR language.

We assume all recipes in a given book are in the same language. That means OCR language is a property of a book and OCR processing should read the language from the book.

If the selected OCR language is unavailable for the current OCR engine/platform, OCR should fall back to English and continue processing.

## Tags and text classification

Tags should be recognized from OCR text and normalized to canonical tag IDs.

Canonical tag IDs are language-agnostic (for example: `#pasta`, `#italian`, `#whole_year`).

Tag labels are localized at display time to current UI language.

Each canonical tag must have a label per display language (at least English and Polish in V1).

Examples:
- If UI language is Polish and recipe comes from an English book, tags should still normalize to canonical IDs and display in Polish (for example `makaron`, `włoskie`, `cały rok`).
- If UI language is Polish and recipe comes from a Polish book, tags should normalize to the same canonical IDs and display in Polish.

## Search behavior

For tag search, both English and Polish query terms must work.

Search input should be normalized to canonical tag IDs and matched against stored canonical tags.

V1 does not include a dedicated tag suggestion/autocomplete UI; this requirement applies to filtering/matching behavior.

## Book language

The user must be able to edit a book language.

In the book management screen, there should be two actions on the left side: Edit and Set language.

Set language action requirements:
- uses the native Apple globe icon,
- has gray styling,
- opens language selection for the book (`en`/`pl`).

## Reprocessing rules

When book language changes, reprocess recipes from that book automatically only if they were not manually touched by the user.

A recipe is considered manually touched when user edited:
- title, or
- tags.

Recipes manually touched in that way are excluded from automatic reprocessing.

## Migration

No legacy-data migration is required for this iteration (test instance data will be reset).

Runtime invariant for this version: all books created in this version must have explicit language (`en` or `pl`).

## Settings screen

Introduce a Settings screen where user can see and set:
- current UI language,
- preferred OCR language.

There should be two sections with two select boxes.

The settings screen should be linked through a global menu entry with a cog icon.
