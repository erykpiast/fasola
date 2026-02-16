import ExpoModulesCore
import Foundation

private let containerId = "iCloud.com.erykpiast.fasola"

public final class ICloudSyncModule: Module {
  private var metadataQuery: NSMetadataQuery?
  private var notificationObservers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("ICloudSync")

    Events("onRemoteChange", "onAvailabilityChanged")

    Function("getContainerUrl") { () -> String? in
      guard let url = FileManager.default.url(
        forUbiquityContainerIdentifier: containerId
      ) else {
        return nil
      }

      let documentsUrl = url.appendingPathComponent("Documents")
      if !FileManager.default.fileExists(atPath: documentsUrl.path) {
        try FileManager.default.createDirectory(
          at: documentsUrl,
          withIntermediateDirectories: true
        )
      }

      return documentsUrl.absoluteString
    }

    Function("startMonitoring") { () in
      self.startMetadataQuery()
    }

    Function("stopMonitoring") { () in
      self.stopMetadataQuery()
    }

    AsyncFunction("resolveConflicts") { (path: String) in
      guard let url = URL(string: path) else { return }
      try self.resolveFileConflicts(at: url)
    }

    AsyncFunction("migrateToContainer") { (sourcePath: String, containerPath: String) in
      guard let sourceUrl = URL(string: sourcePath),
            let containerUrl = URL(string: containerPath) else {
        return
      }
      try self.performMigration(from: sourceUrl, to: containerUrl)
    }
  }

  // MARK: - NSMetadataQuery

  private func startMetadataQuery() {
    guard metadataQuery == nil else { return }

    let query = NSMetadataQuery()
    query.searchScopes = [NSMetadataQueryUbiquitousDocumentsScope]
    query.predicate = NSPredicate(format: "%K LIKE '*'", NSMetadataItemFSNameKey)

    let updateObserver = NotificationCenter.default.addObserver(
      forName: .NSMetadataQueryDidUpdate,
      object: query,
      queue: .main
    ) { [weak self] notification in
      self?.handleQueryUpdate(notification)
    }

    let finishObserver = NotificationCenter.default.addObserver(
      forName: .NSMetadataQueryDidFinishGathering,
      object: query,
      queue: .main
    ) { [weak self] notification in
      self?.handleQueryUpdate(notification)
    }

    let availabilityObserver = NotificationCenter.default.addObserver(
      forName: NSNotification.Name.NSUbiquityIdentityDidChange,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      let available = FileManager.default.ubiquityIdentityToken != nil
      self?.sendEvent("onAvailabilityChanged", ["available": available])
    }

    notificationObservers = [updateObserver, finishObserver, availabilityObserver]
    metadataQuery = query

    DispatchQueue.main.async {
      query.start()
    }
  }

  private func stopMetadataQuery() {
    metadataQuery?.stop()
    metadataQuery = nil

    for observer in notificationObservers {
      NotificationCenter.default.removeObserver(observer)
    }
    notificationObservers = []
  }

  private func handleQueryUpdate(_ notification: Notification) {
    guard let query = notification.object as? NSMetadataQuery else { return }

    query.disableUpdates()
    defer { query.enableUpdates() }

    var changedFiles: [String] = []

    for i in 0..<query.resultCount {
      guard let item = query.result(at: i) as? NSMetadataItem,
            let url = item.value(forAttribute: NSMetadataItemURLKey) as? URL else {
        continue
      }

      // Trigger download for placeholder (.icloud) files
      let fileName = url.lastPathComponent
      if fileName.hasPrefix(".") && fileName.hasSuffix(".icloud") {
        try? FileManager.default.startDownloadingUbiquitousItem(at: url)
      }

      changedFiles.append(url.absoluteString)
    }

    if !changedFiles.isEmpty {
      sendEvent("onRemoteChange", ["changedFiles": changedFiles])
    }
  }

  // MARK: - Conflict Resolution

  private func resolveFileConflicts(at url: URL) throws {
    guard let conflictVersions = NSFileVersion.unresolvedConflictVersionsOfItem(at: url),
          !conflictVersions.isEmpty else {
      return
    }

    // Read current version
    let currentData = try Data(contentsOf: url)
    guard var currentRecipes = try JSONSerialization.jsonObject(with: currentData) as? [[String: Any]] else {
      // Not a JSON array — mark conflicts resolved and bail
      try NSFileVersion.removeOtherVersionsOfItem(at: url)
      for version in conflictVersions { version.isResolved = true }
      return
    }

    // Build ID set from current version
    var recipeIds = Set<String>()
    for recipe in currentRecipes {
      if let id = recipe["id"] as? String {
        recipeIds.insert(id)
      }
    }

    // Merge from each conflict version (union by ID, current wins for duplicates)
    for version in conflictVersions {
      let versionUrl = version.url
      guard let versionData = try? Data(contentsOf: versionUrl),
            let versionRecipes = try? JSONSerialization.jsonObject(with: versionData) as? [[String: Any]] else {
        continue
      }

      for recipe in versionRecipes {
        if let id = recipe["id"] as? String, !recipeIds.contains(id) {
          currentRecipes.append(recipe)
          recipeIds.insert(id)
        }
      }
    }

    // Write merged result
    let mergedData = try JSONSerialization.data(withJSONObject: currentRecipes, options: [.sortedKeys])
    try mergedData.write(to: url, options: .atomic)

    // Mark all conflicts resolved
    for version in conflictVersions {
      version.isResolved = true
    }
    try NSFileVersion.removeOtherVersionsOfItem(at: url)
  }

  // MARK: - Migration

  private func performMigration(from source: URL, to container: URL) throws {
    let fileManager = FileManager.default

    // Copy photos directory
    let sourcePhotos = source.appendingPathComponent("photos")
    let destPhotos = container.appendingPathComponent("photos")

    if fileManager.fileExists(atPath: sourcePhotos.path) {
      if !fileManager.fileExists(atPath: destPhotos.path) {
        try fileManager.createDirectory(at: destPhotos, withIntermediateDirectories: true)
      }

      let contents = try fileManager.contentsOfDirectory(
        at: sourcePhotos,
        includingPropertiesForKeys: nil
      )

      for fileUrl in contents {
        let destFile = destPhotos.appendingPathComponent(fileUrl.lastPathComponent)
        if !fileManager.fileExists(atPath: destFile.path) {
          try fileManager.copyItem(at: fileUrl, to: destFile)
        }
      }
    }
  }
}
