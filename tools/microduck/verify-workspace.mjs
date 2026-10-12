#!/usr/bin/env node
// Browser acceptance against the real editor and prepared iframe physics engine.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const { chromium } = createRequire(import.meta.url)(
  process.env.BOTLAB_PLAYWRIGHT_MODULE || 'playwright',
);
const appUrl = process.env.BOTLAB_QA_URL || 'http://127.0.0.1:4200/';
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(appUrl).hostname),
  'Use a local QA app URL',
);
const output = resolve(process.env.BOTLAB_QA_OUTPUT || 'tmp/workspace-qa');
const checkout = resolve(
  process.env.BOTLAB_SIMULATOR_CHECKOUT || 'tmp/microduck-simulator',
);
const storageKey = 'botlab.workspace.v1';
mkdirSync(output, { recursive: true });
const report = {
  appUrl,
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  upstreamRevision: execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  checks: {},
  runs: [],
  errors: [],
  passed: false,
};
const browser = await chromium.launch({
  channel: process.env.BOTLAB_BROWSER_CHANNEL || 'chrome',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});
// Fresh context: never use a personal browser profile or seed application storage.
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on('pageerror', (error) => report.errors.push(error.message));
const block = (id) =>
  page.locator(`.blocklyBlockCanvas [data-id="${id}"]`).first();
const execution = () => page.getByLabel('Simulator execution', { exact: true });
const stored = () =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
const updates = () => page.evaluate(() => window.workspaceUpdates);
let frame;

async function editNumber(id, value) {
  await block(id).locator(':scope > .blocklyEditableField').click();
  const input = page.locator('input.blocklyHtmlInput');
  await input.fill(String(value));
  await input.press('Enter');
  await page.waitForFunction(
    ({ key, id, value }) => {
      const doc = JSON.parse(localStorage.getItem(key));
      const xml = new DOMParser().parseFromString(
        doc.workspace.content,
        'text/xml',
      );
      return (
        xml.querySelector(`[id="${id}"] > field`)?.textContent === String(value)
      );
    },
    { key: storageKey, id, value },
  );
}
async function assertIdle() {
  assert.equal(
    await page.locator('iframe').count(),
    0,
    'Restoring a document must not connect or run',
  );
  assert.match(await execution().innerText(), /Not run/);
  assert.equal((await updates()).length, 0);
}
async function run() {
  await page.evaluate(() => {
    window.workspaceUpdates = [];
  });
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.locator('iframe').waitFor();
  frame = await (await page.locator('iframe').elementHandle()).contentFrame();
  await frame.waitForFunction(() => !!window.rl, null, { timeout: 90000 });
  await page.waitForFunction(
    () => window.workspaceUpdates.some((u) => u.status === 'running'),
    null,
    { timeout: 90000 },
  );
  return (await updates()).find((u) => u.status === 'running').executionId;
}
async function terminal(
  status,
  label = status === 'completed' ? 'Execution confirmed' : 'Execution stopped',
) {
  await page.waitForFunction(
    () =>
      window.workspaceUpdates.some((u) =>
        ['completed', 'failed', 'stopped'].includes(u.status),
      ),
    null,
    { timeout: 120000 },
  );
  const events = await updates();
  assert.equal(events.at(-1).status, status, JSON.stringify(events.at(-1)));
  await page.waitForFunction(
    ({ key, status, id }) => {
      const last = JSON.parse(localStorage.getItem(key)).lastExecution;
      return last?.status === status && last.executionId === id;
    },
    { key: storageKey, status, id: events.at(-1).executionId },
  );
  const saved = (await stored()).lastExecution;
  assert.ok(
    events.every(
      (e) =>
        e.executionId === saved.executionId &&
        e.artifactId === saved.source.artifactId,
    ),
  );
  assert.equal(saved.events.at(-1).status, status);
  await execution().filter({ hasText: label }).waitFor();
  const summary = page
    .locator('summary')
    .filter({ hasText: 'Last execution:' });
  await summary.click();
  assert.ok(
    (await summary.locator('..').innerText()).includes(saved.source.artifactId),
  );
  await summary.click();
  report.runs.push({ events, saved });
  return saved;
}
async function physics() {
  return frame.evaluate(() => {
    const source = window.rl.controller.sources.find((s) => s.id === 'botlab');
    return {
      command: Array.from(source.command),
      frames: source.frames,
      cursor: source.cursor,
      locomotion: window.rl.loco,
    };
  });
}

try {
  await page.addInitScript(() => {
    window.workspaceUpdates = [];
    window.addEventListener('message', (event) => {
      if (
        event.source === document.querySelector('iframe')?.contentWindow &&
        event.data?.type === 'botlab.microduck.execution.v1'
      ) {
        window.workspaceUpdates.push(event.data);
      }
    });
  });
  await page.goto(appUrl);
  await page.getByRole('button', { name: /MicroDuck Simulator/ }).click();
  await page.locator('.blocklySvg').first().waitFor();
  const fixture = {
    schemaVersion: 1,
    locale: 'en',
    workspace: {
      id: 'workspace-acceptance',
      kind: 'blocks',
      engine: 'scratch-blocks',
      format: 'scratch-xml',
      behaviorId: 'workspace-acceptance',
      label: 'Workspace acceptance',
      content:
        '<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="start" x="32" y="32"><next><block type="botlab_microduck_walk_distance" id="walk"><field name="DISTANCE">0.5</field><next><block type="botlab_microduck_turn_right" id="turn"><next><block type="control_wait" id="wait"><value name="DURATION"><shadow type="math_positive_number" id="duration"><field name="NUM">2</field></shadow></value></block></next></block></next></block></next></block></xml>',
    },
  };
  // Public file import builds the connected sequence; edit its field in the real Scratch UI.
  await page.locator('input[type=file]').setInputFiles({
    name: 'workspace.botlab.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await block('walk').waitFor();
  await editNumber('walk', 0.25);
  const authored = await stored();
  await assertIdle();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export project', exact: true })
    .click();
  const download = await downloadPromise;
  await download.saveAs(resolve(output, 'exported.botlab.json'));
  assert.deepEqual(
    JSON.parse(readFileSync(resolve(output, 'exported.botlab.json'), 'utf8')),
    authored,
  );
  await page.reload();
  await page.getByRole('button', { name: /MicroDuck Simulator/ }).click();
  await block('walk').waitFor();
  assert.deepEqual((await stored()).workspace, authored.workspace);
  await assertIdle();
  report.checks.editAutosaveExportReload = true;
  console.log(
    'PASS: real field editing, autosave, export and reload without execution',
  );

  await run();
  await page.waitForFunction(
    () =>
      window.workspaceUpdates.some(
        (u) =>
          u.status === 'running' && u.frameIndex === 0 && u.distanceMeters > 0,
      ),
    null,
    { timeout: 60000 },
  );
  await block('walk')
    .locator(':scope > .blocklyPath')
    .evaluate((el) => {
      if (
        !el.closest('.blocklyHighlighted') &&
        !el.classList.contains('blocklyHighlighted')
      )
        throw new Error('Active walk is not highlighted');
    });
  const first = await terminal('completed');
  assert.deepEqual(
    first.source.frames.map((f) => f.sourceBlockId).filter(Boolean),
    ['walk', 'turn', 'wait'],
  );
  assert.equal(first.source.frames[0].distanceMeters, 0.25);
  assert.equal(first.source.frames[1].angleDegrees, 90);
  const firstEvents = report.runs.at(-1).events;
  assert.ok(
    firstEvents.some((e) => e.frameIndex === 0 && e.distanceMeters >= 0.25),
    'Measured walk arrival',
  );
  assert.ok(
    firstEvents.some((e) => e.frameIndex === 1 && e.turnedDegrees >= 90),
    'Measured turn arrival',
  );
  assert.ok(
    first.events.some((e) => e.status === 'running' && e.frameIndex === 2),
    'Wait present in saved trace',
  );
  assert.deepEqual((await physics()).command, [0, 0, 0]);
  await page.screenshot({ path: resolve(output, 'completed.png') });
  report.checks.measuredExecutionAndTrace = true;

  await page.reload();
  await page.getByRole('button', { name: /MicroDuck Simulator/ }).click();
  await block('walk').waitFor();
  await assertIdle();
  assert.deepEqual((await stored()).lastExecution, first);
  assert.match(
    await page
      .locator('summary')
      .filter({ hasText: 'Last execution:' })
      .innerText(),
    /Execution confirmed/,
  );
  report.checks.restoreTraceWithoutResuming = true;

  await editNumber('walk', 0.5);
  await run();
  await page.waitForFunction(
    () =>
      window.workspaceUpdates.some(
        (u) =>
          u.status === 'running' &&
          u.frameIndex === 0 &&
          u.distanceMeters > 0.02,
      ),
    null,
    { timeout: 60000 },
  );
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const stopped = await terminal('stopped');
  await page.waitForTimeout(3000);
  assert.ok(
    (await updates()).every(
      (e) => e.frameIndex === undefined || e.frameIndex === 0,
    ),
    'No turn or wait after stop',
  );
  assert.deepEqual((await physics()).command, [0, 0, 0]);
  assert.equal((await updates()).at(-1).status, 'stopped');
  report.checks.acknowledgedStopWithoutFollowingActions = true;
  await page.screenshot({ path: resolve(output, 'stopped.png') });
  console.log(
    'PASS: measured walk/turn/wait, restored trace, acknowledged stop without later actions',
  );

  await editNumber('walk', 0.15);
  // Historical trace remains available, but current execution must be invalidated after editing.
  assert.deepEqual((await stored()).lastExecution, stopped);
  assert.match(await execution().innerText(), /Not run/);
  const rerunId = await run();
  assert.notEqual(rerunId, stopped.executionId);
  assert.notEqual(rerunId, first.executionId);
  const rerun = await terminal('completed');
  assert.equal(
    rerun.source.frames[0].distanceMeters,
    0.15,
    'Rerun compiles the edited distance',
  );
  assert.ok(
    rerun.events.every(
      (e) => Date.parse(e.at) >= Date.parse(stopped.events.at(-1).at),
    ),
  );
  assert.ok(report.runs.at(-1).events.every((e) => e.executionId === rerunId));
  report.checks.editInvalidationAndFreshRerun = true;
  console.log('PASS: edited program gets a fresh execution and matching trace');

  await editNumber('walk', 0.5);
  await run();
  await page.waitForFunction(
    () =>
      window.workspaceUpdates.some(
        (u) =>
          u.status === 'running' &&
          u.frameIndex === 0 &&
          u.distanceMeters > 0.02,
      ),
    null,
    { timeout: 60000 },
  );
  await editNumber('walk', 0.1);
  const editedDuringRun = await terminal('stopped', 'Not run');
  assert.equal(
    editedDuringRun.source.frames[0].distanceMeters,
    0.5,
    'Cancellation retains the old plan in history',
  );
  await page.waitForTimeout(3000);
  assert.ok(
    (await updates()).every(
      (e) => e.frameIndex === undefined || e.frameIndex === 0,
    ),
  );
  assert.deepEqual((await physics()).command, [0, 0, 0]);
  report.checks.editDuringExecutionCancelsOldPlan = true;

  await editNumber('walk', 0.5);
  const interruptedId = await run();
  await page.waitForFunction(
    (key) =>
      JSON.parse(localStorage.getItem(key)).lastExecution?.status === 'running',
    storageKey,
  );
  await page.reload();
  await page.getByRole('button', { name: /MicroDuck Simulator/ }).click();
  await block('walk').waitFor();
  await assertIdle();
  const interrupted = (await stored()).lastExecution;
  assert.equal(interrupted.executionId, interruptedId);
  assert.equal(interrupted.status, 'interrupted');
  assert.match(
    await page
      .locator('summary')
      .filter({ hasText: 'Last execution:' })
      .innerText(),
    /Execution interrupted/,
  );
  report.checks.reloadDuringExecutionDoesNotResume = true;
  assert.deepEqual(report.errors, []);
  report.passed = true;
  console.log(
    'PASS: editing during execution cancels the old plan; reload marks an active run interrupted',
  );
} catch (error) {
  report.error = String(error);
  throw error;
} finally {
  report.lastUpdates = await updates().catch(() => []);
  report.lastDocument = await stored().catch(() => undefined);
  writeFileSync(
    resolve(output, 'report.json'),
    JSON.stringify(report, null, 2),
  );
  writeFileSync(
    resolve(output, 'page.txt'),
    await page
      .locator('body')
      .innerText()
      .catch(() => ''),
  );
  await page
    .screenshot({ path: resolve(output, 'result.png'), fullPage: true })
    .catch(() => {});
  await browser.close();
}
