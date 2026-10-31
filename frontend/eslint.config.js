import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
// typescript-eslint needs the TypeScript JS API, which TypeScript 7 does not ship and
// typescript-eslint does not support yet. It lives in tools/ts-eslint with TypeScript 6.
import tseslint from "./tools/ts-eslint/node_modules/typescript-eslint/dist/index.js";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "test-results", "playwright-report", "tools"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // `const { x: _x, ...rest } = obj` is the idiom for omitting a key.
      "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_", argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
);
