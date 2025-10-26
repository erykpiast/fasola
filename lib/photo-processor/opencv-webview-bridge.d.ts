/**
 * Type declarations for raw JavaScript imports via Metro custom transformer.
 * Files matching certain patterns are loaded as strings by metro-raw-loader-transformer.js
 */

declare module "*/opencv-webview-bridge.js" {
  const content: string;
  export default content;
}
