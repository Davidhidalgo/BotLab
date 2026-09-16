#!/usr/bin/env node
// Physics regression: run against the real local app and prepared official host.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.BOTLAB_PLAYWRIGHT_MODULE || 'playwright',
);
const appUrl = process.env.BOTLAB_QA_URL || 'http://127.0.0.1:4200/';
const output = resolve(process.env.BOTLAB_QA_OUTPUT || 'tmp/turn-regression');
const checkout = resolve(
  process.env.BOTLAB_SIMULATOR_CHECKOUT || 'tmp/microduck-simulator',
);
const toleranceDegrees = 10;
const turns = [
  { type: 'turn_right', angle: 90 },
  { type: 'turn_left', angle: -90 },
  { type: 'turn_around', angle: 180 },
  { type: 'turn_degrees', angle: 15 },
  { type: 'turn_degrees', angle: -15 },
  { type: 'turn_degrees', angle: -180 },
  { type: 'turn_degrees', angle: 360 },
];
mkdirSync(output, { recursive: true });
const report = {
  appUrl,
  upstreamRevision: execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  toleranceDegrees,
  results: [],
};
const browser = await chromium.launch({
  channel: process.env.BOTLAB_BROWSER_CHANNEL || 'chrome',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
let frame;
try {
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // Observe existing public upstream debug hooks without altering commands or physics.
  // Install before boot so the first yaw measurement of each block is recorded.
  await page.addInitScript(() => {
    let current;
    Object.defineProperty(window, 'rl', {
      configurable: true,
      get: () => current,
      set(rl) {
        current = rl;
        const source = rl.controller.sources.find(
          (candidate) => candidate.id === 'botlab',
        );
        if (!source) return;
        window.botlabTurnSamples = [];
        const poll = source.poll.bind(source);
        source.poll = function (dt) {
          const q = rl.data.qpos;
          const sample = {
            time: performance.now(),
            yaw: Math.atan2(
              2 * (q[3] * q[6] + q[4] * q[5]),
              1 - 2 * (q[5] * q[5] + q[6] * q[6]),
            ),
            frameId: this.frames[this.cursor]?.sourceBlockId,
            angle: this.frames[this.cursor]?.angleDegrees,
            cursor: this.cursor,
            locked: rl.inputLocked,
            loco: rl.loco,
          };
          poll(dt);
          window.botlabTurnSamples.push({
            ...sample,
            command: Array.from(this.command),
            nextCursor: this.cursor,
          });
        };
      },
    });
    window.botlabTurnUpdates = [];
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'botlab.microduck.execution.v1')
        window.botlabTurnUpdates.push(event.data);
    });
  });
  await page.goto(appUrl);
  await page.getByRole('button', { name: /MicroDuck Simulator/ }).click();
  const blocks = turns.flatMap(({ type, angle }, i) => [
    `<block type="botlab_microduck_${type}" id="turn-${i}">${type === 'turn_degrees' ? `<field name="ANGLE">${angle}</field>` : ''}</block>`,
    `<block type="control_wait" id="settle-${i}"><value name="DURATION"><shadow type="math_positive_number"><field name="NUM">3</field></shadow></value></block>`,
  ]);
  // A short measured walk also verifies turning after prior movement.
  blocks.unshift(
    '<block type="botlab_microduck_walk_distance" id="walk"><field name="DISTANCE">0.25</field></block>',
  );
  const chain = blocks.reduceRight(
    (next, block) =>
      block.replace(
        /<\/block>$/,
        `${next ? `<next>${next}</next>` : ''}</block>`,
      ),
    '',
  );
  const workspace = {
    schemaVersion: 1,
    locale: 'en',
    workspace: {
      id: 'turn-regression',
      kind: 'blocks',
      engine: 'scratch-blocks',
      format: 'scratch-xml',
      behaviorId: 'turn-regression',
      label: 'Turn regression',
      content: `<xml><block type="event_whenflagclicked"><next>${chain}</next></block></xml>`,
    },
  };
  await page.locator('input[type=file]').setInputFiles({
    name: 'turn-regression.botlab.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(workspace)),
  });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.waitForFunction(() => !!document.querySelector('iframe'), null, {
    timeout: 60000,
  });
  frame = page
    .frames()
    .find(
      (candidate) =>
        candidate !== page.mainFrame() && candidate.url().startsWith('http'),
    );
  assert(frame, 'Simulator iframe must exist');
  await frame.waitForFunction(() => !!window.rl, null, { timeout: 90000 });
  report.locomotion = await frame.evaluate(() => window.rl.loco);
  assert.equal(
    report.locomotion,
    'legs',
    'This regression is calibrated for Feet mode',
  );
  console.log('Running measured turns in Feet mode', report.upstreamRevision);
  for (let i = 0; i < turns.length; i++) {
    // Progress messages are not used as evidence of settled angle; measure qpos below.
    await frame.waitForFunction(
      (index) =>
        window.botlabTurnSamples.some(
          (sample) => sample.frameId === `settle-${index}`,
        ) ||
        window.rl.controller.sources.find((source) => source.id === 'botlab')
          .frames.length === 0,
      i,
      { timeout: 90000 },
    );
    const updates = await page.evaluate(() => window.botlabTurnUpdates);
    assert.notEqual(
      updates.at(-1)?.status,
      'failed',
      JSON.stringify(updates.at(-1)),
    );
    console.log('Reached turn', i + 1, turns[i].angle);
  }
  await page.waitForFunction(
    () =>
      window.botlabTurnUpdates.some((update) =>
        ['completed', 'failed'].includes(update.status),
      ),
    null,
    { timeout: 90000 },
  );
  report.updates = await page.evaluate(() => window.botlabTurnUpdates);
  assert.equal(
    report.updates.at(-1)?.status,
    'completed',
    JSON.stringify(report.updates.at(-1)),
  );
  report.samples = await frame.evaluate(() => window.botlabTurnSamples);
  for (let i = 0; i < turns.length; i++) {
    const start = report.samples.findIndex(
      (sample) => sample.frameId === `turn-${i}` && !sample.locked,
    );
    const end = report.samples.findLastIndex(
      (sample) => sample.frameId === `settle-${i}`,
    );
    assert(start >= 0 && end > start, `Missing physics samples for turn ${i}`);
    let degrees = 0;
    for (let j = start + 1; j <= end; j++) {
      const delta = report.samples[j].yaw - report.samples[j - 1].yaw;
      degrees -= (Math.atan2(Math.sin(delta), Math.cos(delta)) * 180) / Math.PI;
    }
    const result = {
      requested: turns[i].angle,
      settled: degrees,
      error: Math.abs(degrees - turns[i].angle),
    };
    report.results.push(result);
    assert(result.error <= toleranceDegrees, JSON.stringify(result));
  }
  // Replay in the same scene and interrupt the first turn before the next block starts.
  await page.evaluate(() => {
    window.botlabTurnUpdates = [];
  });
  await frame.evaluate(() => {
    window.botlabTurnSamples = [];
    window.botlabSceneIdentity = 'retained';
  });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await frame.waitForFunction(
    () =>
      window.botlabTurnSamples.some(
        (sample) =>
          sample.frameId === 'turn-0' && Math.abs(sample.command[2]) > 0,
      ),
    null,
    { timeout: 60000 },
  );
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.waitForFunction(
    () =>
      window.botlabTurnUpdates.some((update) => update.status === 'stopped'),
    null,
    { timeout: 10000 },
  );
  await page.waitForTimeout(1500);
  const stopped = await frame.evaluate(() => ({
    command: Array.from(
      window.rl.controller.sources.find((source) => source.id === 'botlab')
        .command,
    ),
    scene: window.botlabSceneIdentity,
    dispatchedNext: window.botlabTurnSamples.some(
      (sample) => sample.frameId === 'settle-0' || sample.frameId === 'turn-1',
    ),
  }));
  assert.deepEqual(stopped.command, [0, 0, 0]);
  assert.equal(stopped.scene, 'retained');
  assert.equal(stopped.dispatchedNext, false);
  assert.deepEqual(pageErrors, []);
  report.stop = stopped;
  report.passed = true;
  console.log(
    'PASS',
    JSON.stringify({ results: report.results, stop: stopped }),
  );
} catch (error) {
  report.passed = false;
  report.error = String(error);
  report.updates = await page
    .evaluate(() => window.botlabTurnUpdates)
    .catch(() => []);
  report.samples = await frame
    ?.evaluate(() => window.botlabTurnSamples)
    .catch(() => []);
  throw error;
} finally {
  writeFileSync(
    resolve(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  await page
    .screenshot({ path: resolve(output, 'result.png'), fullPage: true })
    .catch(() => {});
  await browser.close();
}
