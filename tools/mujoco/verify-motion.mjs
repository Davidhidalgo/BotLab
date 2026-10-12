import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { motionScenarios, scenarioWorkspace } from './motion-scenarios.mjs';
const root = resolve(import.meta.dirname, '../..');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = {
  executedAt: new Date().toISOString(),
  browser: await browser.version(),
  kind: 'accelerated numerical preflight; not interactive FPS',
  robots: {},
};
try {
  const page = await browser.newPage();
  await page.goto(process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4210');
  for (const [robot, scenario] of Object.entries(motionScenarios)) {
    console.log('Numerical motion preflight:', robot);
    const result = await page.evaluate(
      async ({ path, robot, steps }) =>
        (await import(path)).motionReference(robot, steps),
      {
        path: '/@fs' + root + '/tools/mujoco/motion-harness.ts',
        robot,
        steps: scenario.steps,
      },
    );
    const seconds = scenario.steps.reduce(
      (sum, s) => sum + s.durationSeconds,
      0,
    );
    const passed = result.results.every(
      (r) =>
        !r.error &&
        Math.abs(r.simulatedSeconds - seconds) < 1e-5 &&
        r.pathMeters >= scenario.minPathMeters &&
        r.commands
          .filter((c) => c.forward > 0 && c.yaw === 0)
          .every((c) => c.forwardDisplacementMeters > 0.05) &&
        r.commands
          .filter((c) => c.yaw !== 0)
          .every((c) => c.yawRadians * Math.sign(c.yaw) > 0.1),
    );
    report.robots[robot] = {
      ...result,
      expectedSeconds: seconds,
      minPathMeters: scenario.minPathMeters,
      passed,
      gateScope:
        'Finite physics, balance envelope, full duration, minimum path, >5 cm forward for straight positive commands and >0.1 rad in the requested turn direction; backward response is reported separately, not assumed to work',
      directionObservations: result.results[0].commands.map((c) => ({
        label: c.label,
        requestedForward: c.forward,
        requestedYaw: c.yaw,
        forwardDisplacementMeters: c.forwardDisplacementMeters,
        yawRadians: c.yawRadians,
        ...(c.forward < 0
          ? { backwardMotionObserved: c.forwardDisplacementMeters < -0.01 }
          : {}),
      })),
    };
    console.log(
      robot,
      result.results.map(
        ({
          run,
          error,
          simulatedSeconds,
          minHeight,
          maxTiltRadians,
          pathMeters,
          inferenceP95Ms,
        }) => ({
          run,
          error,
          simulatedSeconds,
          minHeight,
          maxTiltRadians,
          pathMeters,
          inferenceP95Ms,
        }),
      ),
    );
    if (passed) {
      await mkdir(resolve(root, 'examples'), { recursive: true });
      await writeFile(
        resolve(root, `examples/${robot}-mujoco-motion.botlab.json`),
        JSON.stringify(scenarioWorkspace(robot), null, 2) + '\n',
      );
    }
  }
  report.passed = Object.values(report.robots).every((r) => r.passed);
  if (!report.passed) process.exitCode = 1;
} finally {
  await writeFile(
    resolve(root, 'docs/evidence/mujoco-motion-validation.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
}
