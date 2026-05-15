export default [
  {
    ignores: ["node_modules/**", "coverage/**"]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        io: "readonly"
      }
    },
    rules: {
      "eqeqeq": "error",
      "no-undef": "error",
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  }
];
