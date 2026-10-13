import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  const base = process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4231';
  await page.route(base + '/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><body>Policy probe</body></html>',
    }),
  );
  await page.goto(base);
  const result = await page.evaluate(
    async (path) => (await import(path)).probePosture(),
    '/@fs' + resolve('tools/mujoco/posture-harness.ts'),
  );
  await writeFile(
    'docs/evidence/microduck-posture-probe.json',
    JSON.stringify(
      { date: new Date().toISOString(), browser: browser.version(), result },
      null,
      2,
    ) + '\n',
  );
  console.log(
    result.map((r) => ({
      mode: r.mode,
      height: r.frame.rootPosition[2],
      minHeight: r.minHeight,
      maxTilt: r.maxTilt,
    })),
  );
} finally {
  await browser.close();
}
