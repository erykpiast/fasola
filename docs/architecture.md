# Architecture

## Directory Structure

- `app/` - Expo Router file-based routing (screens)
- `features/` - Feature modules with components, hooks, and contexts
- `lib/` - Shared utilities, types, repositories, and photo processing pipelines
- `platform/` - Platform-specific code (i18n, theme)
- `modules/` - Native Expo modules (e.g., `liquid-glass` for iOS UI components)

## Key Patterns

**Feature Organization**: Each feature in `features/` contains:

- `components/` - React components
- `hooks/` - Custom hooks
- `context/` - React context providers

**Platform-specific Files**: Use `.native.ts`, `.ios.tsx`, `.web.ts` suffixes for platform-specific implementations with a shared `.d.ts` type definition file.

**Storage Layer**: `lib/storage/` provides platform-specific storage implementations. `lib/repositories/` contains data access patterns (e.g., `recipeRepository`).

**Photo Processing**: `lib/photo-processor/` contains OpenCV-based image processing pipelines:

- `pipelines/geometry/` - Dewarping and perspective correction
- `pipelines/clarity/` - Denoising and sharpening
- `pipelines/lighting/` - CLAHE, white balance
- `pipelines/text-recognition/` - OCR integration

**Background Processing**: `features/background-processing/` manages async photo processing queue.

## Type System

**Semantic Type Aliases** (`lib/types/primitives.ts`):

- Use `RecipeId`, `PhotoId` for identifiers
- Use `PhotoUri`, `ImageUri`, `FileUri`, `DataUrl` for URIs
- Use `StorageKey` for storage keys
- Only use bare `string` for generic text (titles, descriptions)

**Recipe Type** (`lib/types/recipe.ts`): Core data model with `id`, `photoUri`, `timestamp`, `metadata`, `recognizedText`, and `status` fields.

## Path Aliases

- `@/*` maps to project root
- `liquid-glass` maps to `./modules/liquid-glass/index.ts`
