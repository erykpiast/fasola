/**
 * Setup script for Node.js environment.
 * Polyfills browser and Worker globals before any modules are loaded.
 */

import { createCanvas, Image, ImageData } from "canvas";

// Polyfill Worker globals
(global as any).self = {
  addEventListener: (): void => {},
  postMessage: (): void => {},
  ...global,
};

// Polyfill DOM globals
(global as any).Image = Image;
(global as any).ImageData = ImageData;
(global as any).HTMLCanvasElement = createCanvas(1, 1).constructor;
(global as any).HTMLImageElement = Image;
(global as any).document = {
  createElement: (tagName: string) => {
    if (tagName === "canvas") {
      return createCanvas(1, 1);
    }
    if (tagName === "img") {
      return new Image();
    }
    throw new Error(`Unsupported element: ${tagName}`);
  },
};

// Disable Worker in Node.js (will force fallback to main thread)
(global as any).Worker = undefined;
(global as any).window = undefined;

console.log("[Test Setup] Node.js environment configured");
