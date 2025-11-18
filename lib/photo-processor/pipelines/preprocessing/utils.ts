/**
 * Yield control to the main thread to allow animations and UI updates.
 */
export async function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

