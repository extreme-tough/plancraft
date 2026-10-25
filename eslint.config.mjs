import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

// ENG-08: user and AI text is always rendered as text, never as HTML.
const rawHtmlBans = [
  {
    selector: "AssignmentExpression > MemberExpression[property.name=/^(innerHTML|outerHTML)$/]",
    message: "Don't assign HTML strings; render text with React.",
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: "Don't insert HTML strings; render text with React.",
  },
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react/no-danger": "error",
      "no-restricted-syntax": ["error", ...rawHtmlBans],
      eqeqeq: ["error", "always"],
    },
  },
  {
    // The domain layer stays pure: no UI, no Firebase, no network, no I/O (CLAUDE.md).
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react/*", "next", "next/*"], message: "src/domain must not import React or Next." },
            { group: ["firebase", "firebase/*", "firebase-admin", "firebase-admin/*", "@firebase/*"], message: "src/domain must not import Firebase." },
            { group: ["@/data/*", "@/lib/*", "@/server/*", "@/features/*", "@/components/*", "@/app/*"], message: "src/domain may only import from src/domain." },
            { group: ["node:*", "fs", "path", "http", "https"], message: "src/domain must not do I/O." },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "src/domain must not do network calls." },
        { name: "localStorage", message: "src/domain must not touch storage." },
        { name: "window", message: "src/domain must not touch the browser." },
        { name: "document", message: "src/domain must not touch the browser." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Pass 'today' in as an argument (EM-55)." },
        { object: "Math", property: "random", message: "Domain functions must be deterministic." },
      ],
    },
  },
  {
    // Plain CommonJS preload scripts run by Node directly.
    files: ["scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
