import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '../..'),
  b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await b.newPage();
  await p.goto(
    (process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4210') + '/?lab=mujoco',
  );
  const web = await p.evaluate(
    async (path) => (await import(path)).jumperWalkingReference(),
    '/@fs' + root + '/tools/mujoco/browser-harness.ts',
  );
  const native = JSON.parse(
    await readFile(
      resolve(root, 'docs/evidence/jumper-locomotion-native-probe.json'),
      'utf8',
    ),
  );
  const difference = Math.hypot(
    ...web.samples[0].p.map((v, i) => v - native.samples[0].p[i]),
  );
  const end = web.samples.at(-1),
    walk = web.samples[14],
    rest = web.samples[4];
  const distance = Math.hypot(walk.p[0] - rest.p[0], walk.p[1] - rest.p[1]);
  const drift = Math.hypot(
    end.p[0] - web.samples[19].p[0],
    end.p[1] - web.samples[19].p[1],
  );
  const report = {
    executedAt: new Date().toISOString(),
    browser: await b.version(),
    web,
    shortHorizonPositionDifference: difference,
    walkDistance: distance,
    stopDriftAfter20s: drift,
    acceptance: {
      shortHorizonMeters: 0.0001,
      minDistanceMeters: 1,
      maxStopDriftMeters: 0.03,
      minHeightMeters: 0.065,
      simulatedSeconds: 60,
    },
  };
  await writeFile(
    resolve(root, 'docs/evidence/jumper-walking-browser.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  assert(difference < 0.0001);
  assert(distance > 1);
  assert(drift < 0.03);
  console.log(
    JSON.stringify({
      ...report,
      web: { seconds: end.t, wallSeconds: web.wallSeconds },
    }),
  );
} finally {
  await b.close();
}
