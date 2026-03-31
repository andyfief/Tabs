const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @tanstack/react-query v5 ships an `exports` map pointing to its modern
// ESM build. Metro ignores `exports` by default, which causes "Unable to
// resolve ./useQueries.js" errors. Enabling this flag makes Metro honour
// the package.json `exports` field so the correct entry point is used.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
