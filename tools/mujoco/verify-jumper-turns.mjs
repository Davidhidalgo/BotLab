import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const url = process.env.BOTLAB_TEST_URL ?? 'https://botlab.localhost';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = {
  executedAt: new Date().toISOString(),
  browser: browser.version(),
  url,
  sequences: [],
  cancellation: [],
  errors: [],
};
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(url + '/simulation-assets/jumper-walking/manifest.json');
  for (const signs of [
    [1, 1, 1, -1, -1, -1],
    [-1, 1, -1, 1],
  ]) {
    const result = await page.evaluate(
      async ({ path, signs }) => {
        const { measuredGoalReference } = await import(path);
        const turn = (sign) => ({
          kind: 'turn',
          angleRadians: (sign * Math.PI) / 2,
          speed: 1,
          timeoutSeconds: 45,
        });
        const advance = {
          kind: 'distance',
          distanceMeters: 0.5,
          speed: 0.24,
          timeoutSeconds: 60,
        };
        return measuredGoalReference('jumper', [
          ...signs.map(turn),
          advance,
          ...signs.map(turn),
        ]);
      },
      { path: '/@fs' + root + '/tools/mujoco/motion-harness.ts', signs },
    );
    report.sequences.push({ signs, ...result });
    console.log(
      'Sequence',
      signs,
      result.results.map((x) => ({
        error: x.error,
        yaw: x.measuredYawRadians,
        result: x.result,
      })),
    );
  }
  report.cancellation = await page.evaluate(
    async (path) => {
      const { createJumperWalkingSession, loadJumperWalkingManifest } =
        await import(path);
      const session = createJumperWalkingSession();
      const results = [];
      try {
        await session.load(await loadJumperWalkingManifest());
        for (const sign of [-1, 1]) {
          await session.reset();
          const abort = new AbortController();
          const unsub = session.subscribe((frame) => {
            if (frame.timeSeconds >= 1.5) abort.abort();
          });
          const outcome = await session
            .command(
              {
                kind: 'turn',
                angleRadians: (sign * Math.PI) / 2,
                speed: 1,
                timeoutSeconds: 45,
              },
              abort.signal,
            )
            .then(
              (result) => ({ result }),
              (error) => ({ error: String(error) }),
            );
          unsub();
          const stopped = await session.pause();
          await new Promise((resolve) => setTimeout(resolve, 500));
          const later = await session.pause();
          results.push({
            sign,
            outcome,
            stoppedTick: stopped.tick,
            laterTick: later.tick,
            stoppedPosition: stopped.rootPosition,
            laterPosition: later.rootPosition,
            state: later.state,
          });
        }
      } finally {
        session.dispose();
      }
      return results;
    },
    '/@fs' + root + '/libs/simulators/jumper/src/index.ts',
  );
  await expect.poll(() => page.workers().length).toBe(0);
  report.workersAfterDispose = page.workers().length;
  report.passed =
    report.errors.length === 0 &&
    report.sequences.every(
      (s) =>
        s.results.length === s.signs.length * 2 + 1 &&
        s.results.every(
          (x) =>
            x.result &&
            !x.error &&
            (x.command.kind === 'turn'
              ? Math.abs(x.result.yawRadians - x.command.angleRadians) <=
                (5 * Math.PI) / 180
              : Math.abs(x.result.forwardDisplacementMeters - 0.5) <= 0.025),
        ),
    ) &&
    report.cancellation.every(
      (x) =>
        /cancel/i.test(x.outcome.error ?? '') &&
        x.state === 'paused' &&
        x.stoppedTick === x.laterTick &&
        JSON.stringify(x.stoppedPosition) === JSON.stringify(x.laterPosition),
    );
  if (!report.passed) process.exitCode = 1;
} finally {
  await writeFile(
    resolve(root, 'docs/evidence/jumper-turns-validation.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
}
