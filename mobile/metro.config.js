// @ts-check
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const resolvePolyfill = (moduleName) => {
  // Resolve package entrypoint, not Node core builtin id.
  // For `url`, `require.resolve('url')` can return "url" (builtin), which breaks Metro.
  try {
    return require.resolve(`${moduleName}/`);
  } catch {
    return require.resolve(moduleName);
  }
};

// Disable package exports resolution so @noble/hashes subpath imports
// fall back to file-based resolution (e.g. "./crypto.js").
config.resolver.unstable_enablePackageExports = false;

// Node.js built-in polyfills for top-level node_modules.
// Deeply nested packages require the resolveRequest custom resolver below.
config.resolver.extraNodeModules = {
  http: resolvePolyfill('stream-http'),
  https: resolvePolyfill('https-browserify'),
  zlib: resolvePolyfill('browserify-zlib'),
  util: resolvePolyfill('util'),
  stream: resolvePolyfill('readable-stream'),
  crypto: resolvePolyfill('crypto-browserify'),
  // `url` is needed by micro-ftch (Web3Auth dependency)
  url: resolvePolyfill('url'),
};

// Global resolver: intercepts ALL built-in require() calls regardless of
// nesting depth. Required for packages like @toruslabs/eccrypto nested
// inside @toruslabs/broadcast-channel/node_modules.
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = function (context, moduleName, platform) {
  if (moduleName === 'crypto') {
    return { filePath: resolvePolyfill('crypto-browserify'), type: 'sourceFile' };
  }
  if (moduleName === 'stream') {
    return { filePath: resolvePolyfill('readable-stream'), type: 'sourceFile' };
  }
  if (moduleName === 'url') {
    return { filePath: resolvePolyfill('url'), type: 'sourceFile' };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
