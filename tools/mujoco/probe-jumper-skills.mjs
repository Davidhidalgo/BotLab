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
    async ({ path, names }) => (await import(path)).probeJumperSkills(names),
    {
      path: '/@fs' + resolve('tools/mujoco/jumper-skills-harness.ts'),
      names: process.env.BOTLAB_PROBE_SKILLS?.split(','),
    },
  );
  await writeFile(
    process.env.BOTLAB_PROBE_OUTPUT ?? 'docs/evidence/jumper-skills-probe.json',
    JSON.stringify(
      { date: new Date().toISOString(), browser: browser.version(), result },
      null,
      2,
    ) + '\n',
  );
  console.log(
    result.map(({ name, minHeight, maxHeight, maxTilt, counts, failure }) => ({
      name,
      minHeight,
      maxHeight,
      maxTilt,
      counts,
      failure,
    })),
  );
} finally {
  await browser.close();
}
