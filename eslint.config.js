// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
    rules: {
      // React Native screens intentionally hydrate modal/editor state when a
      // record becomes visible. These effects are bounded and do not loop.
      'react-hooks/set-state-in-effect': 'off',
      // PanResponder instances are stable imperative handles by design.
      'react-hooks/refs': 'off',
    },
  }
]);
