import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    setupFiles: ['./vitest.setup.ts'],
    environment: 'node',
    reporters: ['default'],
  },
});
