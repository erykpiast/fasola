const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Use custom transformer for raw .js file loading
config.transformer.babelTransformerPath = require.resolve(
  "./metro-workers-transformer.js"
);

// Add modules folder to watch folders for local Expo modules
config.watchFolders = [path.resolve(__dirname, "modules")];

// Configure module resolution to find local modules
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "modules"),
];

module.exports = config;
