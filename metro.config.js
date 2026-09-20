// expo-sqlite's web worker imports a .wasm file; Metro must treat it as an
// asset or the web bundle fails to resolve it. No effect on Android/iOS.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("wasm");

module.exports = config;
