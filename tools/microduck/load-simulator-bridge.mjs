import { build } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Bundle the library's current source; never execute a stale checked-in receiver. */
export async function loadSimulatorBridge() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const result = await build({
    configFile: false,
    root,
    logLevel: 'silent',
    resolve: { alias: {
      '@botlab/model': resolve(root, 'libs/botlab-model/src/index.ts'),
      '@botlab/simulators-core': resolve(root, 'libs/simulators/core/src/index.ts'),
    } },
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      lib: { entry: resolve(root, 'libs/simulators/microduck/src/lib/microduck-simulator.ts'), formats: ['es'] },
    },
  });
  const output = (Array.isArray(result) ? result[0] : result).output;
  const chunk = output.find(item => item.type === 'chunk' && item.isEntry);
  if (!chunk || chunk.imports.length) throw new Error('Simulator bridge must be a self-contained bundle.');
  return import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
}
