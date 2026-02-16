# iCloud Sync — Implementation Plan

## Context

All app data is local-only: recipe metadata in AsyncStorage (`@recipes` key), photos in `DocumentDirectory/photos/{id}.jpg`. No backup, no multi-device support. Losing the device means losing all recipes.

The goal is transparent iCloud synchronization. If iCloud is enabled on the device, the app syncs automatically. No settings, no login, no UI changes.

## Approach: iCloud Documents

Store app data in the iCloud ubiquity container. Files placed there sync automatically across devices signed into the same iCloud account. The system handles upload scheduling, download prioritization, and offline queueing.

**Why iCloud Documents over CKSyncEngine?** The spec's goals are backup and device migration — not real-time collaborative sync. Photos are write-once (immutable after processing), so file-level conflicts cannot occur on them. Recipe metadata is a single JSON file with infrequent edits by a single user — conflicts are rare and trivially mergeable. No CloudKit schema management, no push notification entitlement, no change token persistence, no CKRecord mapping.

**Why not Core Data + NSPersistentCloudKitContainer?** Would require migrating from AsyncStorage to Core Data. Disproportionate effort for the data model's simplicity.

**Why not NSUbiquitousKeyValueStore?** 1 MB total storage limit. At ~500 bytes per recipe, this caps at ~2000 recipes — an unnecessary hard ceiling.

## Data Flow

```
Local mutation (repository)
  → storage writes recipes.json + photo to ubiquity container
    → iCloud uploads automatically

Remote change (another device)
  → iCloud downloads files to ubiquity container
    → NSMetadataQuery detects update
      → native module emits onRemoteChange to JS
        → ICloudSyncContext calls refreshFromStorage()
          → RecipesContext re-reads and updates state
```

## Key Decisions

**Storage location:** When iCloud is available, all app data lives in the ubiquity container's Documents directory: photos in `photos/{id}.jpg`, recipe metadata in `data/recipes.json`. When iCloud is unavailable, falls back to the app's document directory (current behavior). The storage layer resolves the base path lazily on first access.

**What syncs:** Everything in the ubiquity container, including pending/processing recipes. Simpler than selective sync. Theoretical double-processing on two devices is acceptable: single-user app, the race is extremely unlikely, and both devices produce a valid result. When one device completes processing and writes `status: "ready"`, the other device's `BackgroundProcessingContext` will see the recipe is already ready and skip it.

**Conflict resolution for recipes.json:** Two devices wrote metadata simultaneously → iCloud creates `NSFileVersion` conflict versions. Merge strategy: union of recipe IDs from all versions, current version wins for duplicates. No recipes are lost. Deletions may be "undone" if a conflict version still contains the deleted recipe — acceptable trade-off vs data loss. Implemented in Swift via `NSFileVersion`.

**Photo conflicts:** Cannot occur. Photos are write-once files with unique UUIDs. Two devices never write the same filename independently.

**Container identifier:** `iCloud.com.erykpiast.fasola`.

## Implementation Phases

### Phase 1: Expo Config Plugin

Add iCloud Documents entitlements at build time.

**Create** `modules/icloud-sync/plugin/src/withICloudEntitlements.ts`:
- `com.apple.developer.icloud-container-identifiers` → `["iCloud.com.erykpiast.fasola"]`
- `com.apple.developer.ubiquity-container-identifiers` → `["iCloud.com.erykpiast.fasola"]`
- `com.apple.developer.icloud-services` → `["CloudDocuments"]`

No push notification entitlement needed.

**Modify** `app.json`: add `"./modules/icloud-sync/plugin"` to plugins array.

**Verify:** `npx expo prebuild --clean`, inspect `ios/fasola/fasola.entitlements`.

### Phase 2: Native Module Scaffolding

Follow the `liquid-glass` module pattern.

```
modules/icloud-sync/
  package.json
  expo-module.config.json       # platforms: ["apple"], modules: ["ICloudSyncModule"]
  tsconfig.json
  index.ts
  src/
    ICloudSyncModule.native.ts  # requireNativeModule + event subscriptions
    ICloudSyncModule.ts         # no-op fallback (Android/web)
    types.ts
  ios/
    ICloudSync.podspec          # dep: ExpoModulesCore
    ICloudSyncModule.swift      # Expo Module definition
  plugin/
    src/
      index.ts
      withICloudEntitlements.ts
```

**Add** `"icloud-sync"` path alias to root `tsconfig.json`.

### Phase 3: Swift Implementation

**`ICloudSyncModule.swift`** — single file, Expo Module definition:

```
Events:
  onRemoteChange          — files in ubiquity container changed by another device
  onAvailabilityChanged   — iCloud availability changed (available: boolean)

Functions:
  getContainerUrl()       — ubiquity container Documents URL string, or null
  startMonitoring()       — begin NSMetadataQuery
  stopMonitoring()        — stop NSMetadataQuery
  resolveConflicts(path)  — merge NSFileVersion conflicts for the given file
  migrateToContainer(sourcePath, containerPath) — move existing files
```

Implementation details:

- `getContainerUrl()`: calls `FileManager.default.url(forUbiquityContainerIdentifier: "iCloud.com.erykpiast.fasola")`, appends `/Documents`, creates directory if needed, returns URL string or `nil`
- `startMonitoring()`: creates `NSMetadataQuery` scoped to `NSMetadataQueryUbiquitousDocumentsScope`, observes `.didUpdate` notification, emits `onRemoteChange` when files change. Also triggers download for any `.icloud` placeholder files via `FileManager.startDownloadingUbiquitousItem(at:)`
- `resolveConflicts(path)`: reads `NSFileVersion.unresolvedConflictVersionsOfItem(at:)`. If conflicts exist: parses JSON arrays from current version and all conflict versions, merges by recipe ID union (current wins for duplicates), writes merged result, marks conflicts resolved via `NSFileVersion.removeOtherVersionsOfItem(at:)`
- `migrateToContainer(sourcePath, containerPath)`: copies `photos/` directory and `photos/metadata.json` from source to container. Runs on a background queue to avoid blocking.

### Phase 4: Storage Layer Changes

**Modify** `lib/storage/index.native.ts`:

1. Import `ICloudSyncModule` from the native module (no-op on non-iOS)
2. Lazy base path resolution: on first storage call, check `ICloudSyncModule.getContainerUrl()`. If non-null, use the ubiquity container. Otherwise use `Paths.document` (current behavior). Cache the result.
3. **Migration on first access:** If the ubiquity container is available but empty (no `data/recipes.json`), and AsyncStorage contains `@recipes` data:
   a. Read recipes JSON from AsyncStorage
   b. Write `data/recipes.json` to the ubiquity container
   c. Call `ICloudSyncModule.migrateToContainer()` to copy photo files
   d. Clear AsyncStorage `@recipes` key to prevent re-migration
4. Switch `getItem`/`setItem`/`removeItem` from AsyncStorage to file-based:
   - `getItem(key)` → read `{basePath}/data/{key}.json`, return `null` if file doesn't exist
   - `setItem(key, value)` → write `{basePath}/data/{key}.json`
   - `removeItem(key)` → delete `{basePath}/data/{key}.json`
   - Key sanitization: strip leading `@` (so `@recipes` → `recipes.json`)
5. Update `photosDirectory` to use `{basePath}/photos/`

The `Storage` interface (`lib/storage/types.ts`) does not change. All changes are internal to the native implementation.

### Phase 5: Context Integration

**Create** `features/icloud-sync/context/ICloudSyncContext.tsx`:
- On mount: call `ICloudSyncModule.startMonitoring()`, subscribe to `onRemoteChange` event
- On remote change: call `ICloudSyncModule.resolveConflicts()` for recipes data file, then call `refreshFromStorage()` from `RecipesContext`
- On unmount: call `ICloudSyncModule.stopMonitoring()`, remove event subscription

**Modify** `features/recipes-list/context/RecipesContext.tsx`:
- Add `refreshFromStorage` callback: calls `recipeRepository.getAll()`, updates state via `setRecipes()`
- Expose in context value

**Modify** `app/_layout.tsx`:
- Add `ICloudSyncProvider` inside `RecipesProvider` (it needs `RecipesContext` to call `refreshFromStorage`):

```tsx
<RecipesProvider>
  <ICloudSyncProvider>
    <BackgroundProcessingProvider>
      ...
    </BackgroundProcessingProvider>
  </ICloudSyncProvider>
</RecipesProvider>
```

Note: storage base path resolution happens lazily before `RecipesProvider` reads data (triggered by the `use()` call in `RecipesProvider`). No ordering issue — by the time `ICloudSyncProvider` mounts, storage is already iCloud-aware.

### Phase 6: Migration

Handled within the storage layer's lazy initialization (Phase 4, step 3). No separate migration code needed.

**Existing device with local data** (app update):
1. First storage access triggers lazy init
2. Detects ubiquity container available + no `data/recipes.json` + AsyncStorage has `@recipes`
3. Migrates: writes `data/recipes.json`, copies photos, clears AsyncStorage
4. All subsequent reads/writes go to the ubiquity container
5. iCloud uploads everything on its own schedule

**New device with same iCloud account:**
1. First storage access triggers lazy init
2. Detects ubiquity container available + `data/recipes.json` already present (synced by iCloud)
3. No migration needed — uses container directly
4. If some photos are `.icloud` placeholders, `startMonitoring()` triggers their download

## Files Summary

### Create

| File                                                       | Purpose                     |
|------------------------------------------------------------|-----------------------------|
| `modules/icloud-sync/package.json`                         | Module package definition   |
| `modules/icloud-sync/expo-module.config.json`              | Expo module registration    |
| `modules/icloud-sync/tsconfig.json`                        | TypeScript config           |
| `modules/icloud-sync/index.ts`                             | Module entry point          |
| `modules/icloud-sync/src/types.ts`                         | Shared TS types             |
| `modules/icloud-sync/src/ICloudSyncModule.native.ts`       | Native module bridge (iOS)  |
| `modules/icloud-sync/src/ICloudSyncModule.ts`              | No-op fallback              |
| `modules/icloud-sync/ios/ICloudSync.podspec`               | CocoaPods spec              |
| `modules/icloud-sync/ios/ICloudSyncModule.swift`           | NSMetadataQuery + conflicts |
| `modules/icloud-sync/plugin/src/index.ts`                  | Config plugin entry         |
| `modules/icloud-sync/plugin/src/withICloudEntitlements.ts` | Entitlements setup          |
| `features/icloud-sync/context/ICloudSyncContext.tsx`       | Sync context provider       |

### Modify

| File                                               | Change                                          |
|----------------------------------------------------|-------------------------------------------------|
| `lib/storage/index.native.ts`                      | iCloud base path, file-based key-value, migration |
| `features/recipes-list/context/RecipesContext.tsx`  | Add and expose `refreshFromStorage`             |
| `app/_layout.tsx`                                   | Add `ICloudSyncProvider` to provider tree       |
| `app.json`                                         | Add icloud-sync plugin to plugins array         |
| `tsconfig.json`                                    | Add `icloud-sync` path alias                    |

## Verification

1. **Config plugin**: `npx expo prebuild --clean` — entitlements file contains iCloud Documents entries
2. **Module compiles**: `npx expo run:ios` — no crash on launch
3. **iCloud detection**: `getContainerUrl()` returns a URL when signed into iCloud, `null` when not
4. **Upload**: add a recipe, check Files app → iCloud Drive for the app's container
5. **Download**: install on second device with same iCloud account, recipes appear
6. **Edit propagation**: edit title on device A → updates on device B
7. **Delete propagation**: delete on device A → disappears on device B
8. **Offline**: airplane mode → add recipe → disable airplane mode → sync completes
9. **No iCloud**: sign out of iCloud → app works with local-only storage, no errors
10. **Migration**: existing app with local recipes → update → recipes appear in iCloud
