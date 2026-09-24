import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const env = { ...process.env, NX_DAEMON: 'false', NX_ISOLATE_PLUGINS: 'false' };
const graph = spawnSync(
  resolve(root, 'node_modules/.bin/nx'),
  ['show', 'projects', '--json'],
  { cwd: root, env, encoding: 'utf8' },
);
assert.equal(graph.status, 0, graph.stderr || graph.stdout);
const cases = [
  ['libs/botlab-model/src/probe.ts', '@botlab/ui', true],
  ['libs/runtime/src/probe.ts', '@botlab/blocks', true],
  ['libs/botlab-model/src/probe.ts', 'react', true],
  ['apps/botlab-web/src/app/probe.ts', 'scratch-blocks', true],
  [
    'apps/botlab-web/src/app/probe.ts',
    '../../../../libs/simulators/microduck/src/lib/microduck-turn',
    true,
  ],
  ['libs/simulators/core/src/probe.ts', '@botlab/simulators-microduck', true],
  ['libs/adapters/microduck/src/probe.ts', '@botlab/blocks', true],
  ['libs/adapters/microduck/src/probe.ts', '@botlab/runtime', true],
  ['libs/botlab-model/src/probe.ts', '@botlab/adapters-microduck', true],
  ['libs/runtime/src/probe.ts', '@botlab/model', false],
  ['libs/adapters/microduck/src/probe.ts', '@botlab/model', false],
  ['apps/botlab-web/src/app/probe.ts', '@botlab/simulators-microduck', false],
];
for (const [file, dependency, forbidden] of cases) {
  const probe = resolve(
    root,
    file.replace('probe.ts', `architecture-probe-${process.pid}.ts`),
  );
  // Oxlint's CLI reads real files; use exclusive creation and always clean up.
  writeFileSync(probe, `import '${dependency}';\n`, { flag: 'wx' });
  try {
    const result = spawnSync(
      resolve(root, 'node_modules/.bin/oxlint'),
      [probe, '--format=json'],
      { cwd: root, env, encoding: 'utf8' },
    );
    assert.ok(
      result.status === 0 || result.status === 1,
      result.stderr || result.stdout,
    );
    const { diagnostics } = JSON.parse(result.stdout);
    const violations = diagnostics.filter((message) =>
      message.code?.includes('enforce-module-boundaries'),
    );
    assert.equal(
      violations.length > 0,
      forbidden,
      `${file} -> ${dependency}: ${result.stdout}`,
    );
  } finally {
    unlinkSync(probe);
  }
}
console.log(
  `Architecture boundaries: ${cases.length} allowed/forbidden import checks passed.`,
);
