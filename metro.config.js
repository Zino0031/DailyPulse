const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// pnpm uses an isolated node_modules: only direct deps are symlinked at the
// top level; transitive deps (e.g. `react-native-css-interop`, pulled in by
// `nativewind`) live inside `node_modules/.pnpm/node_modules/`. Metro doesn't
// know to look there by default, so babel-injected imports like
// `require("react-native-css-interop/jsx-runtime")` fail to resolve. Enable
// symlinks and add the pnpm store to the resolver search path — but only
// when a pnpm install is actually present, so `npm ci` on CI keeps the
// defaults expo-doctor expects.
const pnpmStore = path.resolve(projectRoot, 'node_modules/.pnpm');
if (fs.existsSync(pnpmStore)) {
  config.resolver.unstable_enableSymlinks = true;
  config.resolver.nodeModulesPaths = [
    ...(config.resolver.nodeModulesPaths ?? []),
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(pnpmStore, 'node_modules'),
  ];
  config.watchFolders = [
    ...(config.watchFolders ?? []),
    pnpmStore,
  ];
}

module.exports = withNativeWind(config, { input: './global.css' });
