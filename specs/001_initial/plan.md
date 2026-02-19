# Implementation Plan: Photo Import App

## Architecture Overview

**Stack**: React Native (Expo), Expo Router for navigation, TypeScript
**Pattern**: Feature-based module structure with clear separation of concerns

## Development Principles

### Error and Loading State Management

- **Prefer Error Boundaries** over try-catch for component-level error handling
- **Prefer Suspense** over loading state booleans for async operations

## Libraries

### Core Dependencies (to install)

- `expo-image-picker` - camera and library access
- `expo-glass-effect` - liquid glass UI framework
- `i18next` + `react-i18next` - translation system
- `expo-localization` - OS language detection
- `react-error-boundary` - error boundary implementation
- `localforage` - IndexedDB abstraction for web storage

### Already Available

- `expo-image` - optimized image rendering
- `react-native-reanimated` - animations
- `expo-haptics` - tactile feedback

## Module Boundaries

### 1. `/app` - Routing Layer

- `index.tsx` - main photo gallery screen
  - include root level boundary for catastrophic failures
  - suspense until translations load
- `_layout.tsx` - theme provider, i18n setup

### 2. `/platform/theme` - Theming

- `ThemeProvider.tsx` - OS theme detection
- `useTheme.ts` - theme hook
- `glassStyles.ts` - liquid glass style definitions

### 3. `/platform/i18n` - Internationalization

- `config.ts` - i18next configuration
- `translations/en.json` - English strings
- `useTranslation.ts` - re-exported hook

### 4. `/features/photos` - Photo Management

- `components/PhotoGrid.tsx` - 3-column thumbnail grid
- `components/AddPhotoButton.tsx` - bottom centered FAB
- `components/EmptyState.tsx` - arrow + instruction text
- `hooks/usePhotoImport.ts` - image picker logic
- `hooks/usePhotos.ts` - photo list state management
  - return promises that suspend for async storage reads
- `types.ts` - Photo interface definitions

### 5. `/lib` - Utilities

- `storage.ts` - local photo persistence with platform-specific implementations
  - **Native (iOS/Android)**: expo-file-system File/Directory API + AsyncStorage
    - Use modern `File` and `Directory` classes instead of legacy async methods
    - Import from `expo-file-system`: `File`, `Directory`, `Paths`
  - **Web**: localforage (IndexedDB) for binary blob storage
    - Stores images as blobs without base64 encoding overhead
    - Automatic fallback to WebSQL/localStorage if IndexedDB unavailable

## Implementation Steps

1. **Install dependencies**

   - expo-image-picker, expo-glass-effect, i18next, react-i18next, expo-localization, expo-file-system, @react-native-async-storage/async-storage, react-error-boundary, localforage

2. **Setup i18n system**

   - Configure i18next with OS language detection
   - Create English translation file
   - Wrap app with i18n provider
   - Display "Hello world" text as a test

3. **Setup theme system**

   - Create theme provider with OS preference detection
   - Define light/dark glass effect styles
   - Integrate with expo-system-ui
   - The "Hello world" text should be either light on dark background or dark on light background

4. **Build photo storage layer**

   - Create Photo type (id, uri, timestamp)
   - Implement storage hooks for CRUD operations with platform detection
   - **Native**: Use modern File/Directory API: `new File()`, `new Directory()`, `Paths.document`
     - Methods: `file.copy()`, `file.delete()`, `directory.create()`, `directory.exists`
   - **Web**: Use localforage for IndexedDB blob storage
     - Methods: `localforage.setItem()`, `localforage.getItem()`, `localforage.removeItem()`
     - Convert blobs to object URLs for display

5. **Implement photo import**

   - Create usePhotoImport hook with camera and library options
   - Handle permissions and errors
   - Save imported photos to storage

6. **Build UI components**

   - PhotoGrid: FlatList with 3 columns, square crops via expo-image, loading state
     - isolate photo loading/rendering errors with error boundary and suspense
   - AddPhotoButton: Fixed bottom position, glass effect, haptic feedback
   - EmptyState: Conditional render with arrow and translated text

7. **Compose main screen**
   - Integrate all components in app/index.tsx
   - Apply glass effect background
   - Wire up state and actions
