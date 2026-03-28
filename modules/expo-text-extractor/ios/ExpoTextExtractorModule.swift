import ExpoModulesCore
import Vision

public class ExpoTextExtractorModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ExpoTextExtractor")

        Constants([
            "isSupported": true
        ])

        // Backward-compatible: returns string[] only
        AsyncFunction("extractTextFromImage") { (url: URL, promise: Promise) in
            self.performOcr(url: url) { result in
                switch result {
                case .success(let observations):
                    let texts = observations.compactMap { observation in
                        observation.topCandidates(1).first?.string
                    }
                    promise.resolve(texts)
                case .failure(let error):
                    promise.reject(error)
                }
            }
        }

        // New: returns [{text, confidence, bounds: {x, y, width, height}}]
        AsyncFunction("extractTextWithBounds") { (url: URL, promise: Promise) in
            self.performOcr(url: url) { result in
                switch result {
                case .success(let observations):
                    let results = observations.compactMap { observation -> [String: Any]? in
                        guard let candidate = observation.topCandidates(1).first else { return nil }
                        let bb = observation.boundingBox
                        return [
                            "text": candidate.string,
                            "confidence": Float(candidate.confidence),
                            "bounds": [
                                "x": bb.origin.x,
                                // Flip Y from bottom-left (Vision) to top-left origin
                                "y": 1.0 - bb.origin.y - bb.size.height,
                                "width": bb.size.width,
                                "height": bb.size.height
                            ]
                        ]
                    }
                    promise.resolve(results)
                case .failure(let error):
                    promise.reject(error)
                }
            }
        }
    }

    private func performOcr(url: URL, completion: @escaping (Result<[VNRecognizedTextObservation], Error>) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let imageData = try Data(contentsOf: url)
                let image = UIImage(data: imageData)
                guard let cgImage = image?.cgImage else {
                    throw Exception.init(name: "err", description: "Could not create CGImage")
                }

                let requestHandler = VNImageRequestHandler(cgImage: cgImage)
                let request = VNRecognizeTextRequest { (request, error) in
                    if let error = error {
                        completion(.failure(error))
                        return
                    }
                    guard let observations = request.results as? [VNRecognizedTextObservation] else {
                        completion(.success([]))
                        return
                    }
                    completion(.success(observations))
                }
                request.recognitionLevel = .accurate
                request.recognitionLanguages = ["pl", "en"]
                request.usesLanguageCorrection = true

                try requestHandler.perform([request])
            } catch {
                completion(.failure(error))
            }
        }
    }
}
