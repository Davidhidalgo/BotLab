/// <reference types='vitest' />
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/botlab-web',
  resolve: {
    alias: {
      '@botlab/adapters-microduck': resolve(__dirname, '../../libs/adapters/microduck/src/index.ts'),
      '@botlab/adapters-stackchan': resolve(__dirname, '../../libs/adapters/stackchan/src/index.ts'),
      '@botlab/blocks': resolve(__dirname, '../../libs/blocks/src/index.ts'),
      '@botlab/model': resolve(__dirname, '../../libs/botlab-model/src/index.ts'),
      '@botlab/runtime': resolve(__dirname, '../../libs/runtime/src/index.ts'),
      '@botlab/simulators': resolve(__dirname, '../../libs/simulators/src/index.ts'),
      '@botlab/ui': resolve(__dirname, '../../libs/ui/src/index.ts'),
    },
  },
  server: {
    port: 4200,
    host: '127.0.0.1',
  },
  preview: {
    port: 4300,
    host: '127.0.0.1',
  },
  plugins: [react()],
  build: {
    outDir: '../../dist/apps/botlab-web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
