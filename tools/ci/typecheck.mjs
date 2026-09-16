import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function configs(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', 'tmp'].includes(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? configs(path)
      : /^tsconfig\.(app|lib|spec)\.json$/.test(entry.name)
        ? [path]
        : [];
  });
}
for (const config of [
  ...configs(resolve(root, 'apps')),
  ...configs(resolve(root, 'libs')),
].sort()) {
  console.log(`Typecheck ${config.slice(root.length + 1)}`);
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, 'node_modules/typescript/bin/tsc'),
      '-p',
      config,
      '--noEmit',
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
