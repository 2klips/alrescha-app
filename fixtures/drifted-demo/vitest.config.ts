import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    outputFile: {
      json: ".reports/vitest.json",
      junit: ".reports/junit.xml",
    },
    reporters: ["default", "json", "junit"],
  },
});

