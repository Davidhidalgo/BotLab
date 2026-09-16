import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'libs/**/vite.config.{ts,mts}',
      'libs/**/vitest.config.{ts,mts}',
    ],
  },
});
