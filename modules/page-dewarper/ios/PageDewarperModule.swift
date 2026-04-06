import ExpoModulesCore

public class PageDewarperModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PageDewarper")

        AsyncFunction("dewarpImage") { (inputPath: String, promise: Promise) in
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    let url: URL
                    if inputPath.hasPrefix("/") {
                        url = URL(fileURLWithPath: inputPath)
                    } else if let parsed = URL(string: inputPath) {
                        url = parsed
                    } else {
                        throw NSError(domain: "PageDewarper", code: 1, userInfo: [
                            NSLocalizedDescriptionKey: "Invalid input path: \(inputPath)"
                        ])
                    }

                    let imageData = try Data(contentsOf: url)
                    guard let image = UIImage(data: imageData) else {
                        throw NSError(domain: "PageDewarper", code: 2, userInfo: [
                            NSLocalizedDescriptionKey: "Could not create UIImage from data"
                        ])
                    }

                    let result = DewarpPipeline.process(image: image)
                    switch result {
                    case .success(let output):
                        let colorPath = self.writeTempImage(output.colorImage, suffix: "color")
                        let bwPath = self.writeTempImage(output.bwImage, suffix: "bw")

                        promise.resolve([
                            "colorUri": colorPath,
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
            }
        }
    }

    private func writeTempImage(_ image: UIImage, suffix: String) -> String {
        let filename = "\(UUID().uuidString)_\(suffix).jpg"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        if let data = image.jpegData(compressionQuality: 0.95) {
            try? data.write(to: url)
        }
        return url.path
    }
}
