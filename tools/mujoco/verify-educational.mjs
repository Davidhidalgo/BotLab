import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4210');
  const report = {
    executedAt: new Date().toISOString(),
    browser: browser.version(),
    robots: [],
  };
  for (const robot of ['jumper', 'microduck']) {
    const result = await page.evaluate(
      async ({ robot, path }) => {
        const { measuredGoalReference } = await import(path);
        const distance = (value) => ({
          kind: 'distance',
          distanceMeters: value,
          speed: robot === 'jumper' ? 0.24 : 0.25,
          timeoutSeconds: 60,
        });
        const turn = (degrees) => ({
          kind: 'turn',
          angleRadians: (degrees * Math.PI) / 180,
          speed: 1,
          timeoutSeconds: 45,
        });
        return measuredGoalReference(
          robot,
          robot === 'jumper'
            ? [distance(0.5), distance(1), distance(0.1), distance(0)]
            : [
                distance(0.5),
                turn(90),
                distance(0.5),
                turn(90),
                turn(180),
                turn(45),
                turn(360),
                distance(0.1),
                distance(0),
              ],
        );
      },
      { robot, path: '/@fs' + root + '/tools/mujoco/motion-harness.ts' },
    );
    report.robots.push(result);
    console.log(
      result.robot,
      result.results.map((c) => ({
        kind: c.command.kind,
        result: c.result,
        error: c.error,
      })),
    );
  }
  report.passed = report.robots.every(
    (r) =>
      r.results.length === (r.robot === 'jumper' ? 4 : 9) &&
      r.results.every(
        ({ command, result, error }) =>
          result &&
          !error &&
          (command.kind === 'distance'
            ? Math.abs(
                result.forwardDisplacementMeters - command.distanceMeters,
              ) <= 0.025
            : Math.abs(result.yawRadians - command.angleRadians) <=
              (5 * Math.PI) / 180),
      ),
  );
  await writeFile(
    'docs/evidence/mujoco-educational-validation.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser.close();
}
