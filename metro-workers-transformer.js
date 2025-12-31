// Custom Metro transformer to load .js files as raw strings
// This allows us to import the WebView bridge code as a string in React Native

const upstreamTransformer = require("@expo/metro-config/babel-transformer");
const esbuild = require("esbuild");
const path = require("path");

module.exports.transform = function ({ src, filename, options }) {
  // Bundle TypeScript files with esbuild for WebView and Web Worker contexts
  if (
    filename.endsWith("opencv-bridge/webview-bridge.ts") ||
    filename.endsWith("optimization/worker.ts") ||
    filename.endsWith("text-classifier/worker.ts")
  ) {
    try {
      const workspaceRoot = path.resolve(__dirname);
      const result = esbuild.buildSync({
        entryPoints: [filename],
        bundle: true,
        format: "iife",
        target: "es2017",
        platform: "browser",
        minify: false,
        write: false,
        alias: {
          "@": workspaceRoot,
        },
        resolveExtensions: [".ts", ".tsx", ".js", ".jsx"],
      });

      if (result.errors.length > 0) {
        throw new Error(
          `esbuild errors: ${result.errors.map((e) => e.text).join(", ")}`
        );
      }

      const bundledCode = result.outputFiles[0].text;

      return upstreamTransformer.transform({
        src: `module.exports = ${JSON.stringify(bundledCode)}`,
        filename,
        options,
      });
    } catch (error) {
      throw new Error(`Failed to bundle ${filename}: ${error.message}`);
    }
  }
  // Use default transformer for all other files
  return upstreamTransformer.transform({ src, filename, options });
};
