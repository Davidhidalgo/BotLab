/// <reference types='vitest' />
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  plugins: [nxViteTsPaths()],
  test: {
    watch: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
