import type { DataUrl } from "@/lib/types/primitives";
import type { PhotoAdjustmentConfig, DewarpMessage } from "./types";

interface DewarpResult {
  success: boolean;
  processedUri?: DataUrl;
  error?: string;
}

// State management for WebView communication
let isWebViewReady = false;
const pendingRequests = new Map<
  string,
  {
    resolve: (result: DewarpResult) => void;
    reject: (error: Error) => void;
  }
>();

// Called by DewarpWebViewSetup when WebView is ready
export function setDewarpReady(): void {
  isWebViewReady = true;
  console.log("[Phase 1] Native dewarp WebView ready");
}

// Handle messages from WebView
export function handleDewarpMessage(message: DewarpMessage): void {
  if (message.type === "result" && message.id) {
    const pending = pendingRequests.get(message.id);
    if (pending && message.result) {
      pending.resolve({
        success: true,
        processedUri: message.result as DataUrl,
      });
      pendingRequests.delete(message.id);
    }
  } else if (message.type === "error" && message.id) {
    const pending = pendingRequests.get(message.id);
    if (pending) {
      pending.resolve({
        success: false,
        error: message.error || "Unknown error",
      });
      pendingRequests.delete(message.id);
    }
  }
}

// Send message to WebView (imported dynamically to avoid circular dependency)
function sendToWebView(message: DewarpMessage): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { sendToWebView: send } = require("./DewarpWebViewSetup.native");
  send(message);
}

// Process image via WebView bridge
export async function dewarpImage(
  imageUri: DataUrl,
  config: Partial<PhotoAdjustmentConfig["geometry"]>
): Promise<DewarpResult> {
  console.log("[Phase 1] Starting geometry correction (native)");
  
  if (!isWebViewReady) {
    console.warn("[Phase 1] WebView not ready, skipping processing");
    return {
      success: false,
      error: "WebView not initialized",
    };
  }

  return new Promise<DewarpResult>((resolve, reject) => {
    const id = `dewarp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Register pending request
    pendingRequests.set(id, { resolve, reject });
    
    // Send message to WebView
    const message: DewarpMessage = {
      type: "dewarp",
      id,
      imageData: imageUri,
      config,
    };
    
    sendToWebView(message);
    
    // Set timeout to prevent hanging
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        resolve({
          success: false,
          error: "Processing timeout",
        });
      }
    }, 30000); // 30 second timeout
  });
}
