import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", ".claude/**", ".git-worktrees/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Hard cap on source-file length (all lines counted), replacing the
      // bespoke tests/check-file-sizes.sh ratchet. Test files raise this to
      // 600 in the override below (last match wins).
      "max-lines": [
        "error",
        { max: 400, skipBlankLines: false, skipComments: false },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true, allowNullish: true },
      ],
    },
  },
  {
    files: ["src/**/*.test.ts"],
    rules: {
      "max-lines": [
        "error",
        { max: 600, skipBlankLines: false, skipComments: false },
      ],
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["*.{js,mjs,cjs,ts}"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
