import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '../..');
const base = process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4210';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(base + '/?lab=mujoco');
  const path = '/@fs' + root + '/tools/mujoco/browser-harness.ts';
  // Let Vite complete its one-time optimizer navigation before starting a long run.
  await page
    .evaluate(async (p) => {
      await import(p);
    }, path)
    .catch(() => {});
  await page.waitForTimeout(2500);
  const physics = await page.evaluate(
    async (p) => (await import(p)).physicsReference(),
    path,
  );
  console.log('Physics runs completed.');
  await writeFile(
    resolve(root, 'tmp/mujoco-native/browser-physics.json'),
    JSON.stringify(physics),
  );
  const policy = await page.evaluate(
    async ({ path, base }) => (await import(path)).jumperPolicyReference(base),
    { path, base: '/@fs' + root + '/tmp/mujoco-validation/' },
  );
  const native = JSON.parse(
    await readFile(resolve(root, 'tmp/mujoco-native/reference.json'), 'utf8'),
  );
  let jointMax = 0;
  for (let r = 0; r < 3; r++)
    for (let i = 0; i < physics.jumper[r].length; i++)
      for (let j = 0; j < physics.jumper[r][i].q.length; j++)
        jointMax = Math.max(
          jointMax,
          Math.abs(physics.jumper[r][i].q[j] - native.jumper.runs[r][i].q[j]),
        );
  const microduckInference = await page.evaluate(
    async ({ path, vectors }) =>
      (await import(path)).microduckInferenceReference(vectors),
    { path, vectors: native.microduck.vectors },
  );
  assert.equal(microduckInference.failures, 0);
  const positionError = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  const shortError = positionError(
    physics.microduck.samples[0].p,
    native.microduck.samples[0].p,
  );
  const endError = positionError(
    physics.microduck.samples.at(-1).p,
    native.microduck.samples.at(-1).p,
  );
  const report = {
    executedAt: new Date().toISOString(),
    browser: await browser.version(),
    platform: native.platform,
    versions: { mujoco: native.mujoco, onnxruntime: native.onnxruntime },
    jointMaxError: jointMax,
    microduckShortHorizonError: shortError,
    microduckFinalPositionDifference: endError,
    policy,
    microduckInference,
    physics,
  };
  await mkdir(resolve(root, 'docs/evidence'), { recursive: true });
  await writeFile(
    resolve(root, 'docs/evidence/mujoco-browser-validation.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  assert(jointMax < 0.00001, `Jumper native/WASM mismatch: ${jointMax}`);
  assert(
    shortError < 0.00001,
    `MicroDuck initial native/WASM mismatch: ${shortError}`,
  );
  assert.equal(policy.inferenceFailures, 0);
  assert(policy.web.observation < 1e-6 && policy.web.target < 1e-6);
  assert.equal(policy.web.modeMismatches.length, 0);
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
  console.log(
    JSON.stringify({
      jointMaxError: jointMax,
      microduckShortHorizonError: shortError,
      microduckFinalPositionDifference: endError,
      policy,
      inferenceP50Ms: physics.microduck.inferenceP50Ms,
      inferenceP95Ms: physics.microduck.inferenceP95Ms,
    }),
  );
} finally {
  await browser.close();
}
