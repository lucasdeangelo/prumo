// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*"],
  },
  {
    // "@domain/*" is the web app's lib/domain, resolved by tsconfig paths and Metro.
    settings: { "import/resolver": { typescript: { project: "./tsconfig.json" } } },
    rules: { "import/no-unresolved": ["error", { ignore: ["^@domain/"] }] },
  },
]);
