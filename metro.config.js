const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Use custom transformer for raw .js file loading
config.transformer.babelTransformerPath = require.resolve(
  "./metro-workers-transformer.js"
);

module.exports = config;
