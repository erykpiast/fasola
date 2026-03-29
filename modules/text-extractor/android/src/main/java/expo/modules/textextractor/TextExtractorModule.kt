package expo.modules.textextractor

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class TextExtractorModule : Module() {
  private val recognizer by lazy {
    TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  }

  override fun definition() = ModuleDefinition {
    Name("TextExtractor")

    // Returns [{text, confidence, bounds: {x, y, width, height}}]
    // ML Kit v1 (play-services) does not expose block/line confidence, so confidence is always 0
    AsyncFunction("extractText") { uriString: String, promise: Promise ->
      try {
        processImage(uriString) { inputImage, imageWidth, imageHeight ->
          recognizer.process(inputImage)
            .addOnSuccessListener { visionText ->
              val results = visionText.textBlocks.map { block ->
                val box = block.boundingBox
                mapOf(
                  "text" to block.text,
                  "confidence" to 0f,
                  "bounds" to mapOf(
                    "x" to if (box != null && imageWidth > 0) box.left.toFloat() / imageWidth else 0f,
                    "y" to if (box != null && imageHeight > 0) box.top.toFloat() / imageHeight else 0f,
                    "width" to if (box != null && imageWidth > 0) box.width().toFloat() / imageWidth else 0f,
                    "height" to if (box != null && imageHeight > 0) box.height().toFloat() / imageHeight else 0f
                  )
                )
              }
              promise.resolve(results)
            }
            .addOnFailureListener { error ->
              promise.reject(CodedException("err", error))
            }
        }
      } catch (error: Exception) {
        promise.reject(CodedException("UNKNOWN_ERROR", error.message ?: "Unknown error", error))
      }
    }
  }

  private fun processImage(
    uriString: String,
    onReady: (InputImage, Float, Float) -> Unit
  ) {
    val context = appContext.reactContext!!
    val uri = if (uriString.startsWith("content://")) {
      Uri.parse(uriString)
    } else {
      val file = File(uriString)
      if (!file.exists()) {
        throw Exception("File not found: $uriString")
      }
      Uri.fromFile(file)
    }

    val inputImage = InputImage.fromFilePath(context, uri)
    val imageWidth = inputImage.width.toFloat()
    val imageHeight = inputImage.height.toFloat()
    onReady(inputImage, imageWidth, imageHeight)
  }
}
