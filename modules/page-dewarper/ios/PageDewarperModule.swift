import ExpoModulesCore
import PageDewarp

public class PageDewarperModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PageDewarper")

        AsyncFunction("dewarpImage") { (inputPath: String, promise: Promise) in
            DispatchQueue.global(qos: .userInitiated).async(execute: DispatchWorkItem {
                do {
                    let url: URL
                    if inputPath.hasPrefix("file://") {
                        guard let parsed = URL(string: inputPath) else {
                            throw NSError(domain: "PageDewarper", code: 1, userInfo: [
                                NSLocalizedDescriptionKey: "Invalid file URL: \(inputPath.prefix(100))"
                            ])
                        }
                        url = parsed
                    } else if inputPath.hasPrefix("/") {
                        url = URL(fileURLWithPath: inputPath)
                    } else if inputPath.hasPrefix("data:") {
                        throw NSError(domain: "PageDewarper", code: 1, userInfo: [
                            NSLocalizedDescriptionKey: "DataURL input not supported, pass a file path"
                        ])
                    } else if let parsed = URL(string: inputPath) {
                        url = parsed
                    } else {
                        throw NSError(domain: "PageDewarper", code: 1, userInfo: [
                            NSLocalizedDescriptionKey: "Invalid input path: \(inputPath.prefix(100))"
                        ])
                    }

                    let imageData = try Data(contentsOf: url)
                    guard var image = UIImage(data: imageData) else {
                        throw NSError(domain: "PageDewarper", code: 2, userInfo: [
                            NSLocalizedDescriptionKey: "Could not create UIImage from \(imageData.count) bytes"
                        ])
                    }

                    // Downscale large images to prevent OOM during OpenCV processing.
                    let maxDimension: CGFloat = 2000
                    let w = image.size.width
                    let h = image.size.height
                    if max(w, h) > maxDimension {
                        let scale = maxDimension / max(w, h)
                        let newSize = CGSize(width: w * scale, height: h * scale)
                        UIGraphicsBeginImageContextWithOptions(newSize, true, 1.0)
                        image.draw(in: CGRect(origin: .zero, size: newSize))
                        if let resized = UIGraphicsGetImageFromCurrentImageContext() {
                            image = resized
                        }
                        UIGraphicsEndImageContext()
                    }

                    NSLog("[PageDewarper] Input size: %.0fx%.0f, starting pipeline...",
                          image.size.width, image.size.height)
                    let startTime = CFAbsoluteTimeGetCurrent()

                    let result = DewarpPipeline.process(image: image, method: .powell, output: .binary)

                    let elapsed = CFAbsoluteTimeGetCurrent() - startTime
                    NSLog("[PageDewarper] Pipeline completed in %.2fs", elapsed)

                    switch result {
                    case .success(let bwImage):
                        NSLog("[PageDewarper] Success — bw: %.0fx%.0f",
                              bwImage.size.width, bwImage.size.height)
                        let bwPath = try self.writeTempImage(bwImage, suffix: "bw")

                        promise.resolve([
                            "bwUri": bwPath,
                        ])
                    case .failure(let error):
                        throw NSError(domain: "PageDewarper", code: 3, userInfo: [
                            NSLocalizedDescriptionKey: "Dewarping failed: \(error)"
                        ])
                    }
                } catch {
                    promise.reject("DEWARP_ERROR", error.localizedDescription)
                }
            })
        }
    }

    private func writeTempImage(_ image: UIImage, suffix: String) throws -> String {
        let filename = "\(UUID().uuidString)_\(suffix).jpg"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        guard let data = image.jpegData(compressionQuality: 0.95) else {
            throw NSError(domain: "PageDewarper", code: 4, userInfo: [
                NSLocalizedDescriptionKey: "Failed to encode image as JPEG"
            ])
        }
        try data.write(to: url)
        return url.path
    }
}
