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
const scratchBlocksMediaSourceDirs = [
  resolve(__dirname, '../../node_modules/scratch-blocks/media'),
  resolve(__dirname, '../../node_modules/blockly/media'),
];

export default defineConfig({
  root: __dirname,
  define: {
    'process.env.BOTLAB_NATIVE_SIMULATOR_URL': JSON.stringify(process.env.BOTLAB_NATIVE_SIMULATOR_URL ?? 'http://127.0.0.1:4401'),
    'process.env.BOTLAB_SIMULATOR_URL': JSON.stringify(
      process.env.BOTLAB_SIMULATOR_URL ?? 'http://127.0.0.1:4300/?boot=1'
    ),
  },
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
      '@botlab/simulators-core': resolve(
        __dirname,
        '../../libs/simulators/core/src/index.ts'
      ),
      '@botlab/simulators-microduck-native': resolve(__dirname, '../../libs/simulators/microduck-native/src/index.ts'),
      '@botlab/simulators-microduck': resolve(
        __dirname,
        '../../libs/simulators/microduck/src/index.ts'
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
  let resolvedConfig: ResolvedConfig;

  return {
    name: 'botlab-scratch-blocks-media',
    configResolved(config) {
      resolvedConfig = config;
    },
    configureServer(server) {
      serveScratchBlocksMedia(server, scratchBlocksMediaSourceDirs);
    },
    async closeBundle() {
      if (resolvedConfig.command !== 'build') {
        return;
      }

      const outputDir = resolve(
        resolvedConfig.root,
        resolvedConfig.build.outDir,
        `.${scratchBlocksMediaPrefix}`
      );

      for (const sourceDir of [...scratchBlocksMediaSourceDirs].reverse()) {
        await cp(sourceDir, outputDir, { recursive: true });
      }
    },
  };
}

function serveScratchBlocksMedia(server: ViteDevServer, sourceDirs: string[]) {
  server.middlewares.use(async (request, response, next) => {
    const requestPath = decodeURIComponent(request.url?.split('?')[0] ?? '');

    if (!requestPath.startsWith(scratchBlocksMediaPrefix)) {
      next();
      return;
    }

    const relativePath = requestPath.slice(scratchBlocksMediaPrefix.length);
    const filePath = await findMediaFile(sourceDirs, relativePath);

    if (!filePath) {
      response.statusCode = 404;
      response.end();
      return;
    }

    try {
      response.setHeader('Content-Type', getMediaContentType(filePath));
      createReadStream(filePath).pipe(response);
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
}

async function findMediaFile(sourceDirs: string[], relativePath: string) {
  for (const sourceDir of sourceDirs) {
    const filePath = resolve(sourceDir, relativePath);

    if (!isInsideDirectory(filePath, sourceDir)) {
      continue;
    }

    try {
      const fileStat = await stat(filePath);

      if (fileStat.isFile()) {
        return filePath;
      }
    } catch {
      continue;
    }
  }

  return undefined;
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
