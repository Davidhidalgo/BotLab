import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)(process.env.BOTLAB_PLAYWRIGHT_MODULE || 'playwright');
const output = 'tmp/iframe-posture-qa';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const checks = {};
let frame;
const posture = (value, id) => `<block type="botlab_microduck_${value}" id="${id}"/>`;
const wait = (value, id) => `<block type="control_wait" id="${id}"><value name="DURATION"><shadow type="math_positive_number"><field name="NUM">${value}</field></shadow></value></block>`;
const condition = (value, id, yes, no = '') => `<block type="${no ? 'control_if_else' : 'control_if'}" id="${id}"><value name="CONDITION"><block type="botlab_microduck_is_${value}"/></value><statement name="SUBSTACK">${yes}</statement>${no ? `<statement name="SUBSTACK2">${no}</statement>` : ''}</block>`;
async function importProgram(blocks) {
  const fixture = JSON.parse(readFileSync('examples/microduck-movement.botlab.json', 'utf8'));
  fixture.locale = 'es';
  const chain = blocks.reduceRight((next, block) => block.replace(/\/>$/, '></block>').replace(/<\/block>$/, `${next ? `<next>${next}</next>` : ''}</block>`), '');
  fixture.workspace.content = `<xml><block type="event_whenflagclicked"><next>${chain}</next></block></xml>`;
  await page.locator('input[type=file]').setInputFiles({ name: 'postures.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
}
async function run() {
  await page.evaluate(() => { window.postureUpdates = []; });
  await page.getByRole('button', { name: 'Ejecutar', exact: true }).click();
  await page.locator('iframe').waitFor({ timeout: 60000 });
  frame = await (await page.locator('iframe').elementHandle()).contentFrame();
  assert.ok(frame);
  await frame.waitForFunction(() => !!window.rl, null, { timeout: 90000, polling: 100 });
}
async function terminal(status) {
  await page.waitForFunction(() => window.postureUpdates.some(u => ['completed', 'failed', 'stopped'].includes(u.status)), null, { timeout: 120000 });
  const updates = await page.evaluate(() => window.postureUpdates);
  assert.equal(updates.at(-1).status, status, JSON.stringify(updates.at(-1)));
  return updates;
}
try {
  await page.addInitScript(() => {
    window.postureUpdates = [];
    window.addEventListener('message', event => { if (event.data?.type === 'botlab.microduck.execution.v1') window.postureUpdates.push(event.data); });
  });
  await page.goto(process.env.BOTLAB_QA_URL || 'http://127.0.0.1:4205/');
  await page.locator('.blocklySvg').first().waitFor();
  await importProgram([
    condition('stand', 'choose-start', posture('sit', 'sit'), posture('stand', 'wrong-start')),
    condition('sit', 'nested', condition('sit', 'nested-sit', posture('stand', 'stand'))),
    '<block type="botlab_microduck_walk_distance" id="walk"><field name="DISTANCE">0.25</field></block>',
    '<block type="botlab_microduck_turn_degrees" id="turn"><field name="ANGLE">90</field></block>',
    condition('stand', 'final', posture('sit', 'final-sit')),
    condition('transitioning', 'stable', posture('stand', 'must-not-stand'), wait(.1, 'done')),
  ]);
  await run();
  const sequence = await terminal('completed');
  checks.decisions = sequence.filter(u => u.conditionResult !== undefined).map(u => u.conditionResult);
  assert.deepEqual(checks.decisions, [true, true, true, true, false]);
  const physical = await frame.evaluate(() => ({ mode: window.rl.mode, sitFlag: window.rl.sitFlag, height: window.rl.data.qpos[2] }));
  assert.equal(physical.mode, 'sitstand'); assert.equal(physical.sitFlag, 1); assert.ok(physical.height < .085);
  checks.finalPosture = physical;
  await page.screenshot({ path: `${output}/completed.png` });
  console.log('Iframe posture branches, walk and turn completed.', physical);
  await importProgram([posture('sit', 'first-sit'), posture('sit', 'redundant'), posture('stand', 'must-not-run')]);
  await run();
  const repeated = await terminal('failed');
  assert.equal(repeated.at(-1).errorCode, 'posture-already-sit');
  assert.equal(repeated.at(-1).frameIndex, 1);
  await page.getByRole('alert').filter({ hasText: 'El robot ya está sentado' }).waitFor();
  checks.repeatedError = true;
  await page.screenshot({ path: `${output}/repeated-error.png` });
  const sitThenStand = '<block type="botlab_microduck_sit" id="cancel-sit"><next>' + posture('stand', 'must-not-stand') + '</next></block>';
  await importProgram([condition('transitioning', 'during-sit', wait(3, 'wait-for-sit'), sitThenStand)]);
  await run();
  await frame.waitForFunction(() => window.rl.controller.sources.find(s => s.id === 'botlab').postureRequested === true);
  await page.getByRole('button', { name: 'Detener', exact: true }).click();
  await terminal('stopped');
  await run();
  const transition = await terminal('completed');
  assert.equal(transition.find(u => u.conditionResult !== undefined)?.conditionResult, true);
  const stopped = await frame.evaluate(() => ({ mode: window.rl.mode, sitFlag: window.rl.sitFlag, command: Array.from(window.rl.controller.sources.find(s => s.id === 'botlab').command) }));
  assert.deepEqual(stopped.command, [0, 0, 0]); assert.equal(stopped.mode, 'sitstand'); assert.equal(stopped.sitFlag, 1);
  checks.cancelAndInspectTransition = stopped;
  assert.deepEqual(errors, []);
  console.log('Repeated posture, cancellation and transition predicate passed.');
} finally {
  const updates = await page.evaluate(() => window.postureUpdates).catch(() => []);
  const state = await frame?.evaluate(() => ({ raw: window.rl.controller.sources.find(s => s.id === 'botlab').getPostureState(), cursor: window.rl.controller.sources.find(s => s.id === 'botlab').cursor })).catch(() => null);
  writeFileSync(`${output}/result.json`, JSON.stringify({ checks, errors, updates, state }, null, 2));
  writeFileSync(`${output}/page.txt`, await page.locator('body').innerText().catch(() => ''));
  await page.screenshot({ path: `${output}/final.png` }).catch(() => {});
  await browser.close();
}
