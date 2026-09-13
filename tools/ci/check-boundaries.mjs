import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const eslint = new ESLint({ cwd: root });
const cases = [
  ['libs/botlab-model/src/probe.ts', '@botlab/ui', true],
  ['libs/runtime/src/probe.ts', '@botlab/blocks', true],
  ['libs/botlab-model/src/probe.ts', 'react', true],
  ['apps/botlab-web/src/app/probe.ts', 'scratch-blocks', true],
  ['apps/botlab-web/src/app/probe.ts', '../../../../libs/simulators/microduck/src/lib/microduck-turn', true],
  ['libs/simulators/core/src/probe.ts', '@botlab/simulators-microduck', true],
  ['libs/runtime/src/probe.ts', '@botlab/model', false],
  ['apps/botlab-web/src/app/probe.ts', '@botlab/simulators-microduck', false],
];
for (const [file, dependency, forbidden] of cases) {
  const [result] = await eslint.lintText(`import '${dependency}';\n`, { filePath: resolve(root, file) });
  const violations = result.messages.filter(message => message.ruleId === '@nx/enforce-module-boundaries');
  assert.equal(violations.length > 0, forbidden, `${file} -> ${dependency}: ${JSON.stringify(result.messages)}`);
}
console.log(`Architecture boundaries: ${cases.length} allowed/forbidden import checks passed.`);
