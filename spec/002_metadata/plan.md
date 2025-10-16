# Recipe Metadata Feature - Implementation Plan

## Architecture Overview

### Data Model Evolution

Transform current `Photo` model into `Recipe` model with embedded metadata:

```typescript
interface Recipe {
  id: string;
  photoUri: string;
  timestamp: number;
  metadata: RecipeMetadata;
}

interface RecipeMetadata {
  title?: string; // Recipe name/title
  source?: `https://${string}` | `http://${string}` | string; // URL or book name
  tags: Array<`#${string}`>; // A string always prefixed with #
}
```

### Module Boundaries

#### **features/recipes-list/** (new)

Recipe grid display and navigation.

**Structure:**

```
features/recipes-list/
├── components/
│   └── RecipeGrid.tsx              # Grid layout with recipe thumbnails
├── context/
│   └── RecipesContext.tsx          # Context provider for recipes state
└── repositories/
    └── recipeRepository.ts         # Recipe repository instance
```

#### **features/recipe-preview/** (new)

Single recipe viewing.

**Structure:**

```
features/recipe-preview/
├── components/
│   └── RecipeViewScreen.tsx        # Recipe detail view screen
└── hooks/
    └── useRecipeById.ts            # Single recipe fetch
```

#### **features/recipe-form/** (new)

Recipe metadata adding and editing.

**Structure:**

```
features/recipe-form/
├── components/
│   ├── AddRecipeForm.tsx           # New recipe flow
│   ├── EditRecipeForm.tsx          # Edit existing recipe
│   └── MetadataFormFields.tsx      # All form inputs grouped
└── hooks/
    └── useRecipeForm.ts            # Form state, validation, submission
```

#### **lib/components/** (shared)

Reusable UI components.

**Structure:**

```
lib/components/
├── atoms/
│   ├── RecipeImageDisplay.tsx      # Full-width square image
│   ├── RecipeTitleOverlay.tsx      # Gradient + title text
│   ├── TagList.tsx                 # Horizontal tag display
│   ├── SourceDisplay.tsx           # Link or book icon rendering
│   ├── FormInput.tsx               # Styled text input wrapper
│   ├── TagInput.tsx                # Tag input with # validation
│   ├── CloseButton.tsx             # Fixed (x) button
│   └── EditButton.tsx              # Fixed pencil button
└── molecules/
    ├── RecipeHeader.tsx            # Image + title overlay
    └── RecipeMetadataDisplay.tsx   # Tags + source display
```

#### **lib/types/** (shared)

Domain types.

**Structure:**

```
lib/types/
└── recipe.ts                       # Recipe, RecipeMetadata types
```

#### **lib/utils/** (shared)

Validation and parsing utilities.

**Structure:**

```
lib/utils/
└── recipeValidation.ts             # Tag validation, source parsing
```

#### **features/photos/** (existing - refactored)

Handles image import with platform-specific implementations.

**Structure:**

```
features/photos/
├── hooks/
│   └── usePhotoImport/
│       ├── index.native.ts         # Native: action sheet + camera/library
│       └── index.web.ts            # Web: file upload prompt only
└── components/
    └── AddPhotoButton.tsx          # UI trigger for import
```

**Changes:**

- Refactored `hooks/usePhotoImport.ts` → platform-specific directory structure
- Native: Shows camera/library options, haptics, i18n, navigates to /recipe/add
- Web: Direct file upload, navigates to /recipe/add
- Single `startImport()` function exported from both

**Deprecated:**

- `hooks/usePhotos.ts` - Replaced with recipes-list/hooks/useRecipes.ts
- `types.ts` Photo interface - Migrated to Recipe

#### **lib/repositories/** (shared)

Abstract storage behind repository pattern for future migration to remote/cloud.

**Structure:**

```
lib/repositories/
├── types.ts                         # Repository interfaces
├── recipes.ts                       # Repository implementation using storage abstraction
└── photosToRecipesMigration.ts      # Runtime migration from @photos to @recipes
```

**Repository Interface:**

```typescript
interface RecipeRepository {
  getAll(): Promise<Recipe[]>;
  getById(id: string): Promise<Recipe | null>;
  save(recipe: Omit<Recipe, "id" | "timestamp">): Promise<Recipe>;
  update(id: string, metadata: RecipeMetadata): Promise<Recipe>;
  delete(id: string): Promise<void>;
}
```

**Storage Abstraction:**

Repository delegates all storage operations to `lib/storage` module, which provides platform-specific implementations:

```
lib/storage/
├── types.ts        # Storage interface
├── native.ts       # Native implementation (expo-file-system + AsyncStorage)
├── web.ts          # Web implementation (localforage)
└── index.ts        # Platform-based instantiation & exports
```

**Storage Interface:**

```typescript
interface Storage {
  // Photo operations
  getPhotos(): Promise<PhotoWithUri[]>;
  savePhoto(id: string, uri: string, timestamp: number): Promise<string>;
  getPhoto(id: string): Promise<string | null>;
  deletePhoto(id: string): Promise<void>;

  // Generic key-value operations (used by repository and migration)
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
```

**Platform Selection:**

The storage facade uses dynamic imports and lazy instantiation to provide platform-specific implementations:

```typescript
// lib/storage/index.ts
const storagePromise =
  Platform.OS === "web"
    ? import("./web").then((m) => m.WebStorage)
    : import("./native").then((m) => m.NativeStorage);

let storageInstance: Storage | null = null;

export const storage: Storage = {
  async getPhotos() {
    if (!storageInstance) {
      const StorageClass = await storagePromise;
      storageInstance = new StorageClass();
    }
    return storageInstance.getPhotos();
  },
  // ... other methods follow the same pattern
};
```

### Routing Structure

```
app/
├── index.tsx                    # Gallery view (existing)
├── recipe/
│   ├── [id].tsx                # Recipe view mode
│   ├── add.tsx                 # Add new recipe with metadata
│   └── [id]/
│       └── edit.tsx            # Edit existing recipe metadata
```

**Route Parameters:**

- `/recipe/add?uri={tempPhotoUri}` - New recipe flow
- `/recipe/[id]` - View recipe detail
- `/recipe/[id]/edit` - Edit recipe metadata

---

## Component Architecture

### Atomic Components (lib/components/atoms/)

#### 1. RecipeImageDisplay.tsx

Displays full-width image cropped to square aspect ratio.

**Props:**

```typescript
{
  uri: string;
  style?: ViewStyle;
}
```

**Implementation:**

- Uses `expo-image` with `contentFit="cover"`
- Square aspect ratio via height = width
- Full-width using Dimensions.get('window').width

#### 2. RecipeTitleOverlay.tsx

Renders title text over gradient overlay.

**Props:**

```typescript
{
  title?: string;
  style?: ViewStyle;
}
```

**Implementation:**

- Uses `expo-linear-gradient`
- Gradient: transparent top → rgba(0,0,0,0.5) bottom
- Bright text (white) positioned at bottom
- Absolute positioning over parent
- Only renders if title exists

#### 3. TagList.tsx

Displays tags horizontally with space separation.

**Props:**

```typescript
{
  tags: string[];
  style?: ViewStyle;
}
```

**Implementation:**

- Flex wrap layout (multiline when overflow)
- Each tag as Text component
- Space separator between tags
- Empty state if no tags

#### 4. SourceDisplay.tsx

Renders source as link (globe icon) or book reference.

**Props:**

```typescript
{
  source?: string;
  style?: ViewStyle;
}
```

**Implementation:**

- Parses source for http(s):// prefix
- If URL: globe icon + hostname (using URL parsing)
- If not URL: book icon + full source text
- Uses `expo-web-browser` for external links
- Icons from `@expo/vector-icons/MaterialIcons`

#### 5. FormInput.tsx

Styled text input wrapper with label.

**Props:**

```typescript
{
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  style?: ViewStyle;
}
```

**Implementation:**

- Themed TextInput with glass effect styling
- Optional label above input
- Consistent padding and border radius

#### 6. TagInput.tsx

Specialized input for tag management with # validation.

**Props:**

```typescript
{
  tags: string[];
  onChange: (tags: string[]) => void;
  style?: ViewStyle;
}
```

**Implementation:**

- TextInput for comma/space separated tags
- Auto-prefix # if missing on blur
- Validation: no spaces within tags
- Display current tags as pills above input
- Remove tag on pill tap

#### 7. CloseButton.tsx

Fixed top-right close button.

**Props:**

```typescript
{
  onPress: () => void;
}
```

**Implementation:**

- Absolute positioning: top-right
- Glass effect background
- MaterialIcons.close icon
- Sticky during scroll (parent ScrollView handling)

#### 8. EditButton.tsx

Fixed top-right edit button (pencil icon).

**Props:**

```typescript
{
  onPress: () => void;
}
```

**Implementation:**

- Same styling as CloseButton
- MaterialIcons.edit icon
- Positioned top-right, sticky

### Composite Components (lib/components/molecules/)

#### 1. RecipeHeader.tsx

Combines image display with title overlay.

**Props:**

```typescript
{
  photoUri: string;
  title?: string;
}
```

**Composition:**

- RecipeImageDisplay as base
- RecipeTitleOverlay absolute positioned over image

#### 2. RecipeMetadataDisplay.tsx

Groups tags and source display.

**Props:**

```typescript
{
  metadata: RecipeMetadata;
  style?: ViewStyle;
}
```

**Composition:**

- TagList for tags
- SourceDisplay for source
- Vertical stack with spacing

### Form Instances (features/recipe-form/components/)

#### 1. AddRecipeForm.tsx

New recipe creation form.

**Props:**

```typescript
{
  photoUri: string;
  onSubmit: (metadata: RecipeMetadata) => void;
  onCancel: () => void;
}
```

**Composition:**

- ScrollView container
- RecipeImageDisplay (square, full-width) from lib/components/atoms
- CloseButton (sticky, top-right over image) from lib/components/atoms
- MetadataFormFields
- Submit button: "Add recipe"

**Behavior:**

- Empty initial metadata state
- Validates on submit (optional validation)
- Calls onSubmit with metadata
- onCancel navigates back

#### 2. EditRecipeForm.tsx

Edit existing recipe metadata.

**Props:**

```typescript
{
  recipe: Recipe;
  onSubmit: (metadata: RecipeMetadata) => void;
  onCancel: () => void;
}
```

**Composition:**

- Same structure as AddRecipeForm
- Pre-populated with recipe.metadata
- Submit button: "Save changes"

**Behavior:**

- Initialized with existing metadata
- onCancel discards changes, navigates back
- onSubmit updates recipe

#### 3. MetadataFormFields.tsx

All metadata form inputs grouped.

**Props:**

```typescript
{
  value: RecipeMetadata;
  onChange: (metadata: RecipeMetadata) => void;
}
```

**Composition:**

- FormInput for title (from lib/components/atoms)
- FormInput for source (from lib/components/atoms)
- TagInput for tags (from lib/components/atoms)
- Vertical layout with consistent spacing
- Uses useTheme() hook internally for styling

### Screen Components (features/recipe-preview/components/)

#### RecipeViewScreen.tsx

Recipe detail view with edit capability.

**Props:**

```typescript
{
  recipeId: string;
}
```

**Composition:**

- ScrollView container
- RecipeHeader (image + title overlay) from lib/components/molecules
- EditButton (sticky, top-right) from lib/components/atoms
- RecipeMetadataDisplay (tags + source) from lib/components/molecules

**Behavior:**

- Uses useRecipeById(recipeId) from features/recipe-preview/hooks
- EditButton navigates to /recipe/[id]/edit
- Handles loading/error states

### Grid Components (features/recipes-list/components/)

#### RecipeGrid.tsx

Recipe grid display.

**Props:**

```typescript
{
  recipes: Recipe[];
  onRecipeTap: (id: string) => void;
}
```

**Composition:**

- FlatList with 3-column grid
- RecipeImageDisplay from lib/components/atoms for thumbnails
- RecipeTitleOverlay from lib/components/atoms for titles

**Behavior:**

- Uses useRecipes() from features/recipes-list/hooks
- onRecipeTap navigates to /recipe/[id]

---

## Hooks Architecture

### features/recipes-list/context/RecipesContext.tsx

Primary state management for all recipes using React Context pattern.

**Architecture:**

- **RecipesProvider**: Context provider that loads and manages recipes state
- **useRecipes**: Hook that accesses the context

**Signature:**

```typescript
function useRecipes(): {
  recipes: Recipe[];
  addRecipe: (photoUri: string, metadata: RecipeMetadata) => Promise<void>;
};
```

**Implementation:**

- Uses React.use() + Suspense pattern for initial load
- Provider wraps app tree in app/_layout.tsx
- Single source of truth for recipes state across all components
- Updates local state + repository on mutations
- Used by RecipeGrid component and add/edit forms

**Benefits:**

- Simpler than singleton + listener pattern
- Natural React data flow
- No manual subscription management
- Type-safe context access

**Replaces:** features/photos/hooks/usePhotos.ts and previous singleton pattern

### features/recipe-form/hooks/useRecipeForm.ts

Form state management and validation.

**Signature:**

```typescript
function useRecipeForm(config: {
  initialValues?: RecipeMetadata;
  onSubmit: (metadata: RecipeMetadata) => void;
}): {
  values: RecipeMetadata;
  errors: Record<string, string>;
  handleChange: (field: keyof RecipeMetadata, value: any) => void;
  handleSubmit: () => void;
  isDirty: boolean;
};
```

**Implementation:**

- Local state for form values
- Validation on submit: tags start with #, no spaces in tags
- Tracks dirty state for unsaved changes warning
- Handles tag parsing and normalization
- Used by AddRecipeForm and EditRecipeForm

### features/recipe-preview/hooks/useRecipeById.ts

Fetch single recipe by ID.

**Signature:**

```typescript
function useRecipeById(id: string): Recipe | null;
```

**Implementation:**

- Uses React.use() for Suspense integration
- Fetches from lib/repositories/recipeRepository
- Returns null if not found
- Used by RecipeViewScreen and EditRecipeForm

### features/recipe-form/hooks/usePhotoImportFlow.ts

Orchestrates photo import → add recipe flow.

**Signature:**

```typescript
function usePhotoImportFlow(): {
  startImportFromCamera: () => Promise<void>;
  startImportFromLibrary: () => Promise<void>;
};
```

**Implementation:**

- Uses features/photos/hooks/usePhotoImport
- On successful import: navigate to /recipe/add?uri={tempUri}
- Handles permissions errors
- Integrates with expo-router navigation
- Used by AddPhotoButton

---

## Data Flow Diagrams

### Add Recipe Flow

```
[Gallery] User taps "Add Photo"
    ↓
usePhotoImportFlow.startImportFromCamera/Library()
    ↓
Photo picker opens
    ↓
User selects photo → tempUri received
    ↓
Navigate to /recipe/add?uri={tempUri}
    ↓
[AddRecipeForm] renders with RecipeImageDisplay
    ↓
User fills metadata fields (optional)
    ↓
User taps "Add recipe"
    ↓
useRecipeForm.handleSubmit() validates
    ↓
useRecipes.addRecipe(photoUri, metadata)
    ↓
RecipeRepository.save() persists to AsyncStorage + FileSystem
    ↓
Navigate back to [Gallery]
    ↓
New recipe appears in grid
```

### View Recipe Flow

```
[Gallery] User taps recipe thumbnail
    ↓
Navigate to /recipe/[id]
    ↓
[RecipeViewScreen] renders
    ↓
useRecipeById(id) loads recipe (Suspense)
    ↓
Display:
  - RecipeHeader (image + title overlay)
  - TagList (tags below image)
  - SourceDisplay (at bottom)
  - EditButton (top-right, sticky)
```

### Edit Recipe Flow

```
[RecipeViewScreen] User taps EditButton
    ↓
Navigate to /recipe/[id]/edit
    ↓
[EditRecipeForm] renders
    ↓
useRecipeById(id) loads existing recipe
    ↓
useRecipeForm initialized with recipe.metadata
    ↓
User modifies metadata fields
    ↓
User taps "Save changes"
    ↓
useRecipeForm.handleSubmit() validates
    ↓
useRecipes.updateRecipe(id, metadata)
    ↓
RecipeRepository.update() persists changes
    ↓
Navigate back to /recipe/[id]
    ↓
Updated metadata displayed
```

### Cancel/Close Flow

```
[AddRecipeForm] or [EditRecipeForm]
    ↓
User taps CloseButton (x)
    ↓
if (form.isDirty) {
  Show alert: "Discard changes?"
  → Cancel: stay on form
  → Confirm: navigate back
} else {
  Navigate back immediately
}
```

---

## Shared Libraries Implementation

### Types (lib/types/recipe.ts)

```typescript
export interface Recipe {
  id: string;
  photoUri: string;
  timestamp: number;
  metadata: RecipeMetadata;
}

export interface RecipeMetadata {
  title?: string;
  source?: `https://${string}` | `http://${string}` | string;
  tags: Array<`#${string}`>;
}
```

### Validation Utilities (lib/utils/recipeValidation.ts)

- Tag validation: ensure # prefix, no spaces
- Source parsing: URL detection and hostname extraction
- Tag normalization: auto-prefix #, split by comma/space

### Repository Implementation

#### Interface Definition (lib/repositories/types.ts)

```typescript
export interface RecipeRepository {
  getAll(): Promise<Recipe[]>;
  getById(id: string): Promise<Recipe | null>;
  save(recipe: Omit<Recipe, "id" | "timestamp">): Promise<Recipe>;
  update(id: string, metadata: RecipeMetadata): Promise<Recipe>;
  delete(id: string): Promise<void>;
}
```

#### Repository Implementation (lib/repositories/recipes.ts)

**Storage Delegation:**

All storage operations delegated to `lib/storage` module. Repository has no direct AsyncStorage or FileSystem imports, ensuring full platform compatibility.

**Storage Keys:**

- `@recipes` - JSON array of Recipe objects (via `storage.getItem()` / `storage.setItem()`)
- `@photos` - Legacy key (removed after migration by `photosToRecipesMigration.ts`)
- All recipe IDs use UUID format generated by `expo-crypto.randomUUID()`

**Implementation Details:**

1. **getAll()**:
   - Run migration check first via `migrateIfNeeded(RECIPES_KEY)`
   - Read from storage via `storage.getItem('@recipes')`
   - Parse JSON and sort by timestamp (newest first)
   - Returns empty array if no recipes exist
2. **getById(id)**: Filter getAll() results by id
3. **save(recipe)**:
   - Generate id using `expo-crypto.randomUUID()`
   - Save photo via `storage.savePhoto(id, uri, timestamp)`
     - Native: copies to permanent directory, returns file URI
     - Web: saves blob to IndexedDB via localforage, returns blob URL
   - Append to recipes array
   - Persist via `storage.setItem('@recipes', JSON.stringify(recipes))`
4. **update(id, metadata)**:
   - Load recipes via `storage.getItem()`
   - Find by id
   - Merge metadata
   - Persist via `storage.setItem()`
5. **delete(id)**:
   - Delete photo via `storage.deletePhoto(id)`
   - Load recipes
   - Remove from array
   - Persist via `storage.setItem()`

**Platform-Specific Storage:**

**Native (iOS/Android):**

- Photos: `expo-file-system` - copies to `${Paths.document}/photos/{id}.jpg`
- Metadata: `AsyncStorage` - JSON-serialized
- URI format: `file:///.../{id}.jpg`

**Web (Browser):**

- Photos: `localforage` (IndexedDB) - stores as binary blobs
- Metadata: `AsyncStorage` (localStorage wrapper) - JSON-serialized
- URI format: `localforage://{id}` (resolved to object URLs on load)
- Benefits: No base64 encoding overhead, 50MB+ storage quota

### Migration Path

**Runtime migration** executes automatically on first repository access via `lib/repositories/photosToRecipesMigration.ts`:

```typescript
// lib/repositories/photosToRecipesMigration.ts
import { storage } from "../storage";
import type { Recipe } from "../types/recipe";

const LEGACY_PHOTOS_KEY = "@photos";

export async function migrateIfNeeded(newKey: string): Promise<void> {
  const [recipes, photos] = await Promise.all([
    storage.getItem(newKey),
    storage.getItem(LEGACY_PHOTOS_KEY),
  ]);

  if (!recipes && photos) {
    const oldPhotos = JSON.parse(photos);
    const newRecipes: Recipe[] = oldPhotos.map((photo: any) => ({
      id: photo.id,
      photoUri: photo.uri,
      timestamp: photo.timestamp,
      metadata: { tags: [] },
    }));
    await storage.setItem(newKey, JSON.stringify(newRecipes));
    await storage.removeItem(LEGACY_PHOTOS_KEY);
  }
}
```

**Trigger:**

- Called at start of repository's `getAll()` method
- One-time operation per device
- No version tracking needed - detected by presence of `@photos` key

**Behavior:**

- Uses storage facade for platform compatibility (web and native)
- Preserves existing photo files (no file moves)
- Transforms Photo objects to Recipe objects with empty metadata
- Removes legacy `@photos` key after successful migration

**Platform Support:**

- **Native**: Uses AsyncStorage via storage facade
- **Web**: Uses localforage via storage facade
- Migration script has no platform-specific code

---

## Libraries & Dependencies

### Existing (Already Installed)

- **expo-image**: Image display with contentFit
- **expo-file-system**: Photo file management (native platforms)
- **@react-native-async-storage/async-storage**: Metadata persistence
- **expo-router**: File-based routing
- **@expo/vector-icons**: Icons (globe, book, edit, close)
- **expo-web-browser**: External link opening
- **expo-haptics**: Feedback on interactions
- **react-error-boundary**: Error handling
- **react-i18next**: Internationalization
- **localforage**: IndexedDB abstraction for web binary storage
- **react-native-safe-area-context**: Cross-platform safe area handling (iOS notch, Android system bars)

### New Dependencies Required

None. All required dependencies are already installed:

- **expo-linear-gradient** (v15.0.7): Title overlay gradient effect
- **expo-crypto** (v15.0.7): UUID generation in repository

### Libraries NOT Needed

- ❌ **react-hook-form** / **formik**: Simple 3-field form doesn't justify dependency
- ❌ **zod** / **yup**: Basic validation (# prefix) easily custom-coded
- ❌ **react-query**: Suspense + local state sufficient for local-only storage
- ❌ **zustand** / **redux**: Component-level state + hooks adequate for scope

---

## Migration Strategy

### Phase 1: Foundation - Types & Repository & Integration

**Goal:** Set up core data layer (types and storage) and integrate with existing UI.

**Tasks:**

1. Create `lib/types/recipe.ts` with Recipe/RecipeMetadata interfaces
2. Create `lib/repositories/types.ts` with RecipeRepository interface
3. Extend `lib/storage` interface with generic key-value operations:
   - Add `getItem(key)`, `setItem(key, value)`, `removeItem(key)` to Storage interface
   - Implement in NativeStorage using AsyncStorage
   - Implement in WebStorage using localforage
   - Update storage facade in index.ts to expose new methods
4. Implement `lib/repositories/photosToRecipesMigration.ts`:
   - Uses storage facade instead of direct AsyncStorage
   - Checks for `@photos` key, transforms to `@recipes`
   - Platform-agnostic implementation
5. Implement `lib/repositories/recipes.ts`:
   - Uses storage facade for all persistence operations
   - Call migration in `getAll()` before reading data
   - Include all CRUD operations
6. Write unit tests for repository
7. Create `features/recipes-list/context/RecipesContext.tsx`:
   - RecipesProvider component that uses React.use() + Suspense pattern
   - useRecipes hook that accesses context
   - Provides recipes state and addRecipe method
8. Update `app/_layout.tsx`:
   - Wrap app with RecipesProvider in Suspense boundary
9. Update `app/index.tsx`:
   - Replace usePhotos with useRecipes from context
   - Convert Recipe data to Photo format for existing PhotoGrid component
   - Add recipes with empty metadata ({ tags: [] })

**Validation:**

- Tests pass, repository can save/load recipes, migration works with mock data
- App renders existing photos via new Recipe backend
- New photos added using Recipe model with empty metadata
- Migration from @photos to @recipes storage works automatically
- RecipesProvider provides state to all child components

### Phase 2: Shared Components - Image Display

**Goal:** Build basic image display components and integrate into existing grid with navigation.

**Tasks:**

1. Create `lib/components/atoms/RecipeImageDisplay.tsx`
   - Full-width square image display
   - Uses expo-image with contentFit="cover"
2. Create `lib/components/atoms/RecipeTitleOverlay.tsx`
   - Gradient overlay (transparent → black 50%)
   - White text at bottom
   - Uses expo-linear-gradient
3. Create `lib/components/molecules/RecipeHeader.tsx`
   - Composes RecipeImageDisplay + RecipeTitleOverlay
4. Update `features/photos/components/PhotoGrid.tsx`
   - Replace expo-image with RecipeImageDisplay component
   - Add RecipeTitleOverlay for title display
   - Add Pressable wrapper with onPhotoTap callback
5. Create `features/photos/types.ts` with Photo interface (including optional title field)
6. Create `app/recipe/[id].tsx` route
   - Recipe detail view using RecipeHeader
   - Loads recipe by id from useRecipes hook
7. Update `app/index.tsx`
   - Pass recipe title to PhotoGrid
   - Add handlePhotoTap to navigate to /recipe/[id]

**Validation:** Components render in gallery grid with title overlays when metadata exists. Tapping thumbnail navigates to recipe detail screen showing full-width image with title overlay.

### Phase 3: Shared Components - Metadata Display

**Goal:** Build metadata display components.

**Tasks:**

1. Create `lib/components/atoms/TagList.tsx`
   - Flex wrap layout for multiline
   - Space-separated tags
2. Create `lib/components/atoms/SourceDisplay.tsx`
   - URL detection and parsing
   - Globe icon + hostname for URLs
   - Book icon + text for non-URLs
   - Link handling with expo-web-browser
3. Create `lib/components/molecules/RecipeMetadataDisplay.tsx`
   - Composes TagList + SourceDisplay

**Validation:** Components render correctly with sample data.

### Phase 4: Shared Components - Form Inputs

**Goal:** Build form input components.

**Tasks:**

1. Create `lib/components/atoms/FormInput.tsx`
   - Themed TextInput wrapper
2. Create `lib/components/atoms/TagInput.tsx`
   - Text input with # prefix validation
   - Display existing tags as removable pills
3. Create `lib/components/atoms/CloseButton.tsx`
   - Fixed top-right close button
4. Create `lib/components/atoms/EditButton.tsx`
   - Fixed top-right edit button (pencil icon)

**Validation:** Form inputs work independently.

### Phase 5: Recipes List Feature

**Goal:** Build recipe listing functionality.

**Tasks:**

1. Create `features/recipes-list/components/RecipeGrid.tsx`
   - FlatList with 3-column grid
   - Uses RecipeImageDisplay and RecipeTitleOverlay from lib/components
2. Update `app/index.tsx`:
   - Use useRecipes from context
   - Use RecipeGrid component
   - Navigate to /recipe/[id] on tap
3. Create stub `app/recipe/[id].tsx` screen

**Validation:** Gallery displays recipes, navigation to stub screen works.

### Phase 6: Recipe Preview Feature

**Goal:** Build single recipe viewing.

**Tasks:**

1. Create `features/recipe-preview/hooks/useRecipeById.ts`
   - Uses React.use() for Suspense
   - Fetches from repository
2. Create `features/recipe-preview/components/RecipeViewScreen.tsx`
   - Uses RecipeHeader from lib/components/molecules
   - Uses RecipeMetadataDisplay from lib/components/molecules
   - Uses EditButton from lib/components/atoms
3. Update `app/recipe/[id].tsx`:
   - Use RecipeViewScreen component
   - Navigate to /recipe/[id]/edit on EditButton tap
4. Create stub `app/recipe/[id]/edit.tsx` screen

**Validation:** Recipe detail screen displays full metadata.

### Phase 7: Recipe Form Feature - Add Flow

**Goal:** Enable adding recipes.

**Tasks:**

1. Create `lib/utils/recipeValidation.ts` with validation functions
   - Tag validation (# prefix, no spaces)
   - Tag normalization (auto-prefix #, split by comma/space)
   - Source parsing (URL detection)
2. Create `features/recipe-form/hooks/useRecipeForm.ts`
   - Form state management
   - Validation using lib/utils/recipeValidation
3. Refactor `features/photos/hooks/usePhotoImport` into platform-specific implementations
   - Create `features/photos/hooks/usePhotoImport/index.native.ts`
     - Shows camera/library action sheet (iOS) or alert (Android)
     - Includes haptics feedback
     - Handles i18n translations
     - Navigates to /recipe/add after import
   - Create `features/photos/hooks/usePhotoImport/index.web.ts`
     - Shows file upload prompt directly
     - Navigates to /recipe/add after selection
   - Both export single `startImport()` function
4. Create `features/recipe-form/components/MetadataFormFields.tsx`
   - Uses FormInput, TagInput from lib/components/atoms
5. Create `features/recipe-form/components/AddRecipeForm.tsx`
   - Uses RecipeImageDisplay, CloseButton from lib/components/atoms
   - Uses MetadataFormFields
6. Create `app/recipe/add.tsx`:
   - Use AddRecipeForm component
7. Update AddPhotoButton:
   - Use refactored usePhotoImport hook
   - Single startImport() call
8. Write unit tests for validation utilities

**Validation:** Can add recipe with full metadata, validation works correctly.

### Phase 8: Recipe Form Feature - Edit Flow

**Goal:** Enable editing recipes.

**Tasks:**

1. Create `features/recipe-form/components/EditRecipeForm.tsx`
   - Similar to AddRecipeForm but pre-populated
   - Uses useRecipeById from features/recipe-preview/hooks
2. Update `app/recipe/[id]/edit.tsx`:
   - Use EditRecipeForm component
   - Update recipe on submit

**Validation:** Can edit recipe metadata, changes persist.

### Phase 9: Polish & Edge Cases

**Goal:** Handle edge cases and improve UX.

**Tasks:**

1. Unsaved changes warning on form cancel (isDirty check)
2. Empty state messaging when no metadata provided
3. Long text truncation for titles/tags
4. Error states for failed saves/loads
5. Haptic feedback on interactions
6. Loading states with Suspense fallbacks
7. Accessibility labels
8. i18n for all user-facing strings

**Validation:** App handles edge cases gracefully.

### Phase 10: Cleanup

**Goal:** Remove deprecated code.

**Tasks:**

1. Remove deprecated code:
   - `features/photos/hooks/usePhotos.ts`
   - Old Photo type definition
2. Update any remaining imports
3. Test migration with real device data (fresh install + upgrade scenario)

**Validation:** No deprecated code remains, migration tested on real device.

---

## Testing Strategy

### Unit Tests

**Targets:**

- Repository implementations (mock AsyncStorage)
- Validation utils (tag parsing, URL detection)
- Form hooks (useRecipeForm state transitions)

**Tools:** Jest, @testing-library/react-hooks

### Component Tests

**Targets:**

- Atomic components render with props
- Form inputs update state
- Validation errors display

**Tools:** @testing-library/react-native

### Integration Tests

**Targets:**

- Add recipe flow: import → form → save → gallery
- Edit recipe flow: view → edit → save → view
- Form submission with validation errors

**Tools:** @testing-library/react-native

### E2E Tests (Manual)

**Scenarios:**

1. Import photo → add metadata → save → verify in gallery
2. Tap recipe → view details → edit → save → verify changes
3. Add recipe without metadata → verify optional fields
4. Add recipe with URL source → tap link → opens browser
5. Add recipe with book source → verify icon
6. Cancel form with changes → verify warning
7. Delete recipe → verify photo file removed

---

## Key Design Decisions

### 1. Composition Over Configuration

**Rationale:** Spec explicitly requires flexibility to change form behavior independently.

- Separate AddRecipeForm and EditRecipeForm instances
- Different button labels and submit handlers
- Shared atomic components via composition

### 2. Repository Pattern for Storage

**Rationale:** Enable future migration to remote storage without refactoring business logic.

- Abstract interface hides implementation
- Easy to swap AsyncStorage → SQLite → Cloud DB
- Testable with mock implementations

### 3. No Form Library

**Rationale:** Simple 3-field form with basic validation doesn't justify external dependency.

- Custom useRecipeForm hook is ~50 lines
- Avoids bundle size increase
- Full control over validation logic

### 4. Suspense + React.use() Pattern

**Rationale:** Match existing pattern in codebase (features/photos/hooks/usePhotos.ts).

- Consistent data loading strategy
- Declarative error/loading boundaries
- Simplifies async state management

### 5. Route-Based Form State

**Rationale:** Pass photoUri via route params instead of global state.

- Simpler state management
- Deep linking friendly
- No need for Redux/Zustand

### 6. Minimal New Dependencies

**Rationale:** Keep bundle size small, leverage existing expo ecosystem.

- Only add expo-linear-gradient (gradient overlay requirement) and expo-crypto (UUID generation)
- Reuse existing navigation, storage, image libraries

### 7. Photo File Management

**Rationale:** Copy imported photos to permanent location on save.

- Temp URIs from picker are ephemeral
- Controlled directory structure
- Easy cleanup on recipe delete

### 8. Storage Abstraction Layer

**Rationale:** Complete separation of business logic from storage implementation, enabling web support and future migrations.

**Architecture:**

- Repository pattern for domain logic (CRUD operations)
- Storage abstraction for platform-specific implementations
- Single `storage` export with automatic platform selection

**Implementation:**

- `lib/storage/types.ts`: `RecipeStorage` interface defining contract
- `lib/storage/native.ts`: Native implementation (expo-file-system + AsyncStorage)
- `lib/storage/web.ts`: Web implementation (localforage + AsyncStorage)
- `lib/storage/index.ts`: Platform detection and instantiation

**Benefits:**

- Repository has zero storage imports (pure business logic)
- Easy to add new storage backends (SQLite, cloud services)
- Testable with mock storage implementations
- Web support without platform conditionals in repository
- Type-safe generic metadata operations

**Web Storage Strategy:**

- Use `localforage` for IndexedDB abstraction (vs raw IndexedDB API)
- Store images as binary blobs (vs base64 encoding)
- Reduces file size by ~33% compared to base64
- 50MB+ storage quota vs 5-10MB for localStorage
- Automatic fallback to WebSQL/localStorage if IndexedDB unavailable

### 9. Cross-Platform Safe Area Handling

**Rationale:** Ensure consistent UI behavior across iOS, Android, and web platforms.

**Implementation:**

- Use `react-native-safe-area-context` instead of React Native's built-in `SafeAreaView`
- Provides SafeAreaProvider and SafeAreaView components
- Works consistently on both iOS and Android (native SafeAreaView is iOS-only)

**Benefits:**

- Respects device-specific UI elements (notches, status bars, home indicators)
- Cross-platform compatibility without platform-specific conditionals
- More reliable and feature-complete than built-in SafeAreaView

---

## Open Questions & Future Enhancements

### Potential Future Work

1. **Search/Filter**: Search recipes by title, filter by tags
2. **Cloud Sync**: Replace repository with Firebase/Supabase backend
3. **Batch Operations**: Bulk tagging, batch delete
4. **Tag Autocomplete**: Suggest existing tags while typing
5. **Photo Editing**: Crop/rotate before save
6. **Multiple Photos**: Support multiple photos per recipe
7. **Rich Source**: Parse URL metadata (Open Graph)
8. **Export**: Share recipe as image with metadata overlay
9. **Collections**: Group recipes into cookbooks
10. **Favorites**: Star/favorite recipes

### Performance Considerations

- Image thumbnails for gallery (currently full-res)
- Virtualized list for large recipe collections
- Lazy loading metadata on scroll
- Cache parsed source URLs

### Accessibility Considerations

- Screen reader labels for all interactive elements
- Sufficient color contrast for overlay text
- Focus management in forms
- Keyboard navigation support (web)

---

## Success Metrics

### Functional Requirements Met

- ✅ Metadata form appears after photo import
- ✅ All fields optional
- ✅ Photo displayed full-width, square-cropped
- ✅ "Add recipe" CTA at bottom
- ✅ Close button top-right, fixed
- ✅ Edit metadata on existing recipes
- ✅ Recipe view on gallery tap
- ✅ Title overlay with gradient
- ✅ Tags displayed below photo
- ✅ Source with icon (globe/book)
- ✅ Pencil button activates edit mode
- ✅ Composition over configuration architecture
- ✅ Storage abstraction for future migration

### Technical Requirements Met

- ✅ Type-safe TypeScript interfaces
- ✅ Consistent with existing code patterns
- ✅ Reusable component library
- ✅ Testable architecture
- ✅ Minimal external dependencies
- ✅ Migration path for existing data
- ✅ Error boundaries and loading states
