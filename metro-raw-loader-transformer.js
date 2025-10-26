/**
 * Custom Metro transformer that loads specific .js files as raw text strings.
 * This allows importing JavaScript files as strings for injection into WebViews.
 */

const upstreamTransformer = require("@expo/metro-config/babel-transformer");
const fs = require("fs");

module.exports.transform = function ({ src, filename, options }) {
  // Check if this is a file we want to load as raw text
  if (filename.includes("opencv-webview-bridge.js")) {
    // Return the file content as a string literal
    const content = fs.readFileSync(filename, "utf8");
    const code = `module.exports = ${JSON.stringify(content)};`;

    return upstreamTransformer.transform({
      src: code,
      filename,
      options,
    });
  }

  // For all other files, use the default transformer
  return upstreamTransformer.transform({ src, filename, options });
};
