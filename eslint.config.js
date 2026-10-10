// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Edge functions run on Deno (npm:/jsr: specifiers) — linted by `deno lint`.
    ignores: ["dist/*", "supabase/functions/*/index.ts"],
  }
]);
