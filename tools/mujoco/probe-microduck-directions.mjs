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
  kind: 'BL-003 pinned-policy directional investigation; no performance claim',
  policyRevision: '916c1e1ee11f8460506532e037a4cf1aa110aca6',
  policySha256:
    'e36332d383997d51401897734cd3e79cf5038406feddb18b4d57ecfb141daa6c',
  tolerances: { distanceMeters: 0.025, turnDegrees: 5 },
  timed: [],
  goals: [],
  cancellation: [],
  errors: [],
};
const step = (label, forward, yaw, durationSeconds) => ({
  label,
  forward,
  yaw,
  durationSeconds,
});
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(url);
  for (const afterForward of [false, true]) {
    for (const [label, forward, yaw] of [
      ['left', 0, 1],
      ['right', 0, -1],
      ['right-medium', 0, -0.75],
      ['right-low', 0, -0.5],
      ['reverse', -0.2, 0],
      ['forward-control', 0.25, 0],
    ]) {
      const steps = [step('settle', 0, 0, 1)];
      if (afterForward) steps.push(step('advance', 0.25, 0, 8));
      steps.push(step(label, forward, yaw, 20), step('zero-command', 0, 0, 2));
      const result = await page.evaluate(
        async ({ path, steps }) =>
          (await import(path)).motionReference('microduck', steps),
        { path: '/@fs' + root + '/tools/mujoco/motion-harness.ts', steps },
      );
      report.timed.push({ label, afterForward, ...result });
      console.log(
        label,
        afterForward ? 'after forward' : 'rest',
        result.results.map((r) => ({
          error: r.error,
          ...r.commands.find((c) => c.label === label),
        })),
      );
    }
    for (const angle of [-Math.PI / 2, Math.PI / 2]) {
      const commands = afterForward
        ? [
            {
              kind: 'distance',
              distanceMeters: 0.5,
              speed: 0.25,
              timeoutSeconds: 60,
            },
          ]
        : [];
      commands.push({
        kind: 'turn',
        angleRadians: angle,
        speed: 1,
        timeoutSeconds: 45,
      });
      const result = await page.evaluate(
        async ({ path, commands }) =>
          (await import(path)).measuredGoalReference('microduck', commands),
        { path: '/@fs' + root + '/tools/mujoco/motion-harness.ts', commands },
      );
      report.goals.push({ afterForward, angle, ...result });
      console.log('goal', afterForward, angle, result.results);
    }
  }
  // Real paced worker, aborting negative commands after observed physical ticks.
  report.cancellation = await page.evaluate(
    async (path) => {
      const { createMicroduckMujocoSession, loadMicroduckMujocoManifest } =
        await import(path);
      const session = createMicroduckMujocoSession();
      const results = [];
      try {
        await session.load(await loadMicroduckMujocoManifest());
        for (const command of [
          {
            kind: 'turn',
            angleRadians: -Math.PI / 2,
            speed: 1,
            timeoutSeconds: 45,
          },
          { kind: 'velocity', forward: -0.2, yaw: 0, durationSeconds: 20 },
        ]) {
          await session.reset();
          const abort = new AbortController();
          const unsubscribe = session.subscribe((f) => {
            if (f.timeSeconds >= 2) abort.abort();
          });
          const outcome = await session.command(command, abort.signal).then(
            (result) => ({ result }),
            (error) => ({ error: String(error) }),
          );
          unsubscribe();
          const stopped = await session.pause();
          await new Promise((resolve) => setTimeout(resolve, 500));
          const later = await session.pause();
          results.push({
            command,
            outcome,
            stoppedTick: stopped.tick,
            laterTick: later.tick,
            stoppedPosition: stopped.rootPosition,
            laterPosition: later.rootPosition,
            state: later.state,
            simulatedSeconds: later.timeSeconds,
          });
        }
      } finally {
        session.dispose();
      }
      return results;
    },
    '/@fs' + root + '/libs/simulators/microduck-mujoco/src/index.ts',
  );
  await expect.poll(() => page.workers().length).toBe(0);
  report.workersAfterDispose = page.workers().length;
  // Passing means the investigation completed safely, not that all motions work.
  report.probeCompleted =
    report.timed.every(
      (s) =>
        s.results.length === 3 &&
        s.results.every(
          (r) => !r.error && r.commands.length === (s.afterForward ? 4 : 3),
        ),
    ) &&
    report.cancellation.every(
      (r) =>
        r.outcome.error &&
        /cancel/i.test(r.outcome.error) &&
        r.state === 'paused' &&
        r.stoppedTick === r.laterTick &&
        JSON.stringify(r.stoppedPosition) === JSON.stringify(r.laterPosition),
    ) &&
    report.errors.length === 0;
  if (!report.probeCompleted) process.exitCode = 1;
} finally {
  await writeFile(
    resolve(root, 'docs/evidence/microduck-directions-probe.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
}
