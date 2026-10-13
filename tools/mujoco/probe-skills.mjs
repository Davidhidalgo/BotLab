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
    async (path) => (await import(path)).probeSkills(),
    '/@fs' + resolve('tools/mujoco/skill-harness.ts'),
  );
  await writeFile(
    'docs/evidence/microduck-skills-probe.json',
    JSON.stringify(
      { date: new Date().toISOString(), browser: browser.version(), result },
      null,
      2,
    ) + '\n',
  );
  console.log(
    result.map((r) => ({
      name: r.name,
      warmup: r.warmup,
      samples: r.samples.map((s) => ({
        phase: s.phase,
        height: s.feedback.rootPosition[2],
        minHeight: s.minHeight,
        maxTilt: s.maxTilt,
        maxJointChange: s.maxJointChange,
      })),
    })),
  );
} finally {
  await browser.close();
}
