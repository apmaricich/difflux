import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        TextDecoder: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        performance: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
        queueMicrotask: "readonly",
        atob: "readonly",
        btoa: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        structuredClone: "readonly",
        crypto: "readonly",
        WebSocket: "readonly",
        fetch: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
        FormData: "readonly",
        File: "readonly",
        Blob: "readonly",
      },
    },
    rules: {
      // Style and readability
      "no-console": "off",
      "no-unused-vars": ["error", { args: "none" }],
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always"],
      "no-else-return": "error",
      "no-implicit-coercion": ["error", { allow: ["!!"] }],
      "no-magic-numbers": ["warn", { ignore: [-1, 0, 1, 1000, 60000] }],

      // Robustness
      "no-throw-literal": "error",
      "no-undefined": "off",
      "no-useless-catch": "off",
      "require-await": "off",
      "no-await-in-loop": "off",

      // Control regex for ANSI/terminal character sanitization is intentional
      "no-control-regex": "off",

      // Security
      "no-prototype-builtins": "error",
      "object-shorthand": "warn",

      // Maintainability
      "no-bitwise": "warn",
      "no-multi-assign": "error",
      "no-unmodified-loop-condition": "error",
      "no-useless-escape": "error",
      "prefer-arrow-callback": "error",
      "prefer-template": "warn",
      "no-void": "warn",
    },
  },
  {
    files: ["**/test/**"],
    rules: {
      "no-magic-numbers": "off",
    },
  },
];