import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "**/interfaces/*.ts", "**/interfaces/**/*.ts"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 85,
        lines: 90
      }
    }
  }
});
