/**
 * Global type declarations for the project.
 */

/**
 * Type declarations for raw JavaScript/TypeScript imports via Metro custom transformer.
 * The Metro transformer loads bundled .bundle.js files as strings.
 */
declare module "/Users/eryk.napierala/Development/fasola/lib/photo-processor/opencv-webview-bridge" {
  const content: string;
  export default content;
}

declare module "*/opencv-webview-bridge.bundle.js" {
  const content: string;
  export default content;
}

declare module "*/optimization.worker.bundle.js" {
  const content: string;
  export default content;
}
