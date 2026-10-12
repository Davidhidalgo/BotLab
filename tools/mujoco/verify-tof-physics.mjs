import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  await page.goto(process.env.BOTLAB_TEST_URL ?? 'https://botlab.localhost');
  const result = await page.evaluate(
    async (path) => {
      const { probeTof } = await import(path);
      return probeTof();
    },
    '/@fs' + resolve('tools/mujoco/tof-harness.ts'),
  );
  assert.equal(result.mismatch, false);
  assert.ok(result.samples.length >= 74 && result.samples.length <= 76);
  const costs = result.samples
    .map((s) => s.depth.processingMilliseconds)
    .sort((a, b) => a - b);
  const initial = result.samples[0],
    final = result.samples.at(-1);
  assert.ok(final.root[0] - initial.root[0] > 0.2);
  assert.ok(
    final.depth.distancesMeters[27] < initial.depth.distancesMeters[27] - 0.2,
  );
  const report = {
    date: new Date().toISOString(),
    browser: await browser.version(),
    manifestId: result.manifestId,
    physicsIdentical: !result.mismatch,
    samples: result.samples.length,
    costMilliseconds: {
      mean: costs.reduce((a, b) => a + b, 0) / costs.length,
      p95: costs[Math.floor(costs.length * 0.95)],
      max: costs.at(-1),
    },
    initial,
    final,
  };
  await writeFile(
    'docs/evidence/mujoco-tof-physics.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
