const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Add custom transformer for .js files in photo-processor directory
// This allows importing them as raw text strings
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve("./metro-raw-loader-transformer.js"),
};

module.exports = config;
