import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const results = await Promise.all(
    ['microduck', 'jumper'].map(async (robot) => {
      const page = await browser.newPage({ ignoreHTTPSErrors: true });
      await page.goto(
        process.env.BOTLAB_TEST_URL ?? 'https://botlab.localhost',
      );
      const result = await page.evaluate(
        async ({ path, robot }) => {
          const { probeProximity } = await import(path);
          return probeProximity(robot);
        },
        { robot, path: '/@fs' + resolve('tools/mujoco/proximity-harness.ts') },
      );
      console.log(JSON.stringify(result));
      await page.close();
      return result;
    }),
  );
  await writeFile(
    'docs/evidence/mujoco-proximity-physics.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: await browser.version(),
        results,
      },
      null,
      2,
    ) + '\n',
  );
  for (const r of results) {
    assert.equal(r.error, undefined);
    assert.equal(r.trace.at(-1).proximity.value, true);
    for (const t of r.trace.filter((t) => t.targetDistanceMeters !== undefined))
      assert.ok(Math.abs(t.forwardDisplacementMeters - 0.15) <= 0.025);
  }
} finally {
  await browser.close();
}
