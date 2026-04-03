import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["extensions/__tests__/**/*.test.ts"],
  },
});
