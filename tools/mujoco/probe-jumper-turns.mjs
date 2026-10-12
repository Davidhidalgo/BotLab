import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const base = process.env.BOTLAB_TEST_URL ?? 'https://botlab.localhost';
const profile = process.env.BOTLAB_TURN_PROFILE ?? 'tapered';
if (!['tapered', 'fixed', 'center', 'pure-yaw'].includes(profile))
  throw new Error('Unknown turn profile.');
const fixed = ['fixed', 'center', 'pure-yaw'].includes(profile);
const speed = profile === 'pure-yaw' ? 2 : 1;
const runs = Number(process.env.BOTLAB_PROBE_RUNS ?? 3);
if (![1, 3].includes(runs)) throw new Error('Probe runs must be 1 or 3.');
// Preserve the original experiment after the production controller evolves.
const baseRevision = 'fc890ac6536665c5d1e009496f90ee0e09b6b6d0';
const source = execFileSync(
  'git',
  [
    'show',
    baseRevision + ':libs/simulators/jumper/src/lib/walking-controller.ts',
  ],
  { cwd: root, encoding: 'utf8' },
);
const replacements = [
  ['v.yaw !== 0', '!Number.isFinite(v.yaw) || Math.abs(v.yaw) > 2'],
  [
    "for (const axis of ['Lx', 'Rx', 'Ry', 'LT', 'RT'])",
    "current.setAxis('Rx', velocity.yaw === 0 ? 0 : -Math.sign(velocity.yaw) * (0.5 + Math.abs(velocity.yaw) / 8));\n      for (const axis of ['Lx', 'Ry', 'LT', 'RT'])",
  ],
];
let candidate = source;
for (const [from, to] of replacements) {
  if (!candidate.includes(from))
    throw new Error('Candidate source changed; review the probe mapping.');
  candidate = candidate.replace(from, to);
}
if (fixed)
  candidate = candidate.replace('Math.abs(velocity.yaw) / 8', `${speed} / 8`);
if (['center', 'pure-yaw'].includes(profile))
  candidate = candidate.replace(
    'return {\n    validateFeedback',
    'return {\n    turnStopFraction: 0.1,\n    validateFeedback',
  );
const suffix = profile === 'tapered' ? '' : '-' + profile;
const dir = resolve(root, 'tmp/jumper-turn-probe' + suffix);
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, 'controller.ts'), candidate);
const report = {
  executedAt: new Date().toISOString(),
  kind: 'BL-004 test-only yaw mapping; no exposed production capability',
  url: base,
  baseRevision,
  profile,
  runs,
  appliedTurnSpeed: fixed ? speed : 'tapered to 0.65',
  candidateSha256: createHash('sha256').update(candidate).digest('hex'),
  mapping:
    'Rx = yaw == 0 ? 0 : -sign(yaw)*(0.5+abs(yaw)/8); pinned Rx yaw band [0.5,1], range [-4,4]',
  toleranceRadians: (5 * Math.PI) / 180,
  goals: [],
  errors: [],
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
report.browser = browser.version();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => report.errors.push(e.message));
  // A JSON document avoids application HMR reloads during isolated numerical probes.
  await page.goto(base + '/simulation-assets/jumper-walking/manifest.json');
  for (const afterForward of [false, true]) {
    for (const sign of [1, -1]) {
      for (let run = 0; run < runs; run++) {
        const commands = afterForward
          ? [
              {
                kind: 'distance',
                distanceMeters: 0.5,
                speed: 0.24,
                timeoutSeconds: 60,
              },
            ]
          : [];
        commands.push({
          kind: 'turn',
          angleRadians: (sign * Math.PI) / 2,
          speed,
          timeoutSeconds: 45,
        });
        const result = await page.evaluate(
          async ({ harness, controller, commands }) => {
            const { measuredGoalReference } = await import(harness);
            const { createJumperWalkingController } = await import(controller);
            return measuredGoalReference(
              'jumper',
              commands,
              createJumperWalkingController,
            );
          },
          {
            harness: '/@fs' + root + '/tools/mujoco/motion-harness.ts',
            controller: '/@fs' + dir + '/controller.ts',
            commands,
          },
        );
        report.goals.push({ afterForward, sign, run, ...result });
        console.log(
          JSON.stringify({ afterForward, sign, run, results: result.results }),
        );
      }
    }
  }
  report.turnsPassed =
    report.goals.length === 4 * runs &&
    report.goals.every(
      (g) =>
        g.results.length === (g.afterForward ? 2 : 1) &&
        g.results.every(
          (r) =>
            !r.error &&
            r.result &&
            (r.command.kind === 'turn'
              ? Math.abs(r.result.yawRadians - r.command.angleRadians) <=
                report.toleranceRadians
              : Math.abs(
                  r.result.forwardDisplacementMeters - r.command.distanceMeters,
                ) <= 0.025),
        ),
    ) &&
    report.errors.length === 0;
} catch (cause) {
  report.failure = String(cause);
  throw cause;
} finally {
  await writeFile(
    resolve(root, 'docs/evidence/jumper-turns' + suffix + '-probe.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
}
