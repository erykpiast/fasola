/**
 * Custom Metro transformer that loads bundled .js files as raw text strings.
 * This allows importing bundled JavaScript files as strings for injection into WebViews.
 */

const upstreamTransformer = require("@expo/metro-config/babel-transformer");
const fs = require("fs");
const path = require("path");

module.exports.transform = function ({ src, filename, options }) {
  // Check if this is a .bundle.js file that should be loaded as raw text
  if (filename.endsWith(".bundle.js")) {
    // Return the file content as a string literal
    const code = `module.exports = ${JSON.stringify(src)};`;

    return upstreamTransformer.transform({
      src: code,
      filename,
      options,
    });
  }

  // For all other files, use the default transformer
  return upstreamTransformer.transform({ src, filename, options });
};
