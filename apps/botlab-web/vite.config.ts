/// <reference types='vitest' />
import react from '@vitejs/plugin-react';
import { createReadStream } from 'node:fs';
import { cp, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import {
  defineConfig,
  type Plugin,
  type ResolvedConfig,
  type ViteDevServer,
} from 'vite';

const scratchBlocksMediaPrefix = '/vendor/scratch-blocks/media/';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/botlab-web',
  resolve: {
    alias: {
      '@botlab/adapters-microduck': resolve(
        __dirname,
        '../../libs/adapters/microduck/src/index.ts'
      ),
      '@botlab/adapters-stackchan': resolve(
        __dirname,
        '../../libs/adapters/stackchan/src/index.ts'
      ),
      '@botlab/blocks': resolve(__dirname, '../../libs/blocks/src/index.ts'),
      '@botlab/model': resolve(
        __dirname,
        '../../libs/botlab-model/src/index.ts'
      ),
      '@botlab/runtime': resolve(__dirname, '../../libs/runtime/src/index.ts'),
      '@botlab/simulators': resolve(
        __dirname,
        '../../libs/simulators/src/index.ts'
      ),
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
  plugins: [react(), scratchBlocksMedia()],
  build: {
    outDir: '../../dist/apps/botlab-web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});

function scratchBlocksMedia(): Plugin {
  const sourceDir = resolve(
    __dirname,
    '../../node_modules/scratch-blocks/media'
  );
  let resolvedConfig: ResolvedConfig;

  return {
    name: 'botlab-scratch-blocks-media',
    configResolved(config) {
      resolvedConfig = config;
    },
    configureServer(server) {
      serveScratchBlocksMedia(server, sourceDir);
    },
    async closeBundle() {
      if (resolvedConfig.command !== 'build') {
        return;
      }

      await cp(
        sourceDir,
        resolve(
          resolvedConfig.root,
          resolvedConfig.build.outDir,
          `.${scratchBlocksMediaPrefix}`
        ),
        { recursive: true }
      );
    },
  };
}

function serveScratchBlocksMedia(server: ViteDevServer, sourceDir: string) {
  server.middlewares.use(async (request, response, next) => {
    const requestPath = decodeURIComponent(request.url?.split('?')[0] ?? '');

    if (!requestPath.startsWith(scratchBlocksMediaPrefix)) {
      next();
      return;
    }

    const relativePath = requestPath.slice(scratchBlocksMediaPrefix.length);
    const filePath = resolve(sourceDir, relativePath);

    if (!isInsideDirectory(filePath, sourceDir)) {
      response.statusCode = 404;
      response.end();
      return;
    }

    try {
      const fileStat = await stat(filePath);

      if (!fileStat.isFile()) {
        response.statusCode = 404;
        response.end();
        return;
      }

      response.setHeader('Content-Type', getMediaContentType(filePath));
      createReadStream(filePath).pipe(response);
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
}

function isInsideDirectory(filePath: string, directory: string) {
  return filePath === directory || filePath.startsWith(`${directory}${sep}`);
}

function getMediaContentType(filePath: string) {
  switch (extname(filePath).toLowerCase()) {
    case '.cur':
      return 'image/x-icon';
    case '.gif':
      return 'image/gif';
    case '.mp3':
      return 'audio/mpeg';
    case '.ogg':
      return 'audio/ogg';
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml';
    case '.wav':
      return 'audio/wav';
    default:
      return 'application/octet-stream';
  }
}
