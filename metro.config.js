const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Web: SF Symbols do not exist in a browser; draw them with Material Symbols
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'expo-symbols') {
    return { type: 'sourceFile', filePath: path.join(__dirname, 'src/shims/expo-symbols.web.tsx') };
  }
  return (upstream || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
