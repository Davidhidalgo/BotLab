import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)(process.env.BOTLAB_PLAYWRIGHT_MODULE || 'playwright');
const backend = process.env.BOTLAB_QA_BACKEND || 'iframe';
assert.ok(['iframe', 'native'].includes(backend));
const output = `tmp/repeat-qa-${backend}`;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], samples = [], checks = {};
page.on('pageerror', e => errors.push(e.message));
page.on('response', async response => {
  if (backend === 'native' && response.url().endsWith('/state') && response.ok()) {
    try { samples.push(await response.json()); } catch { /* Browser closing. */ }
  }
});
const wait = (seconds, id) => `<block type="control_wait" id="${id}"><value name="DURATION"><shadow type="math_positive_number"><field name="NUM">${seconds}</field></shadow></value></block>`;
const posture = (value, id) => `<block type="botlab_microduck_${value}" id="${id}"/>`;
const repeat = (count, id, body) => `<block type="control_repeat" id="${id}"><value name="TIMES"><shadow type="math_whole_number"><field name="NUM">${count}</field></shadow></value><statement name="SUBSTACK">${body}</statement></block>`;
const toggle = '<block type="control_if_else" id="choose"><value name="CONDITION"><block type="botlab_microduck_is_stand"/></value><statement name="SUBSTACK">' + posture('sit', 'sit') + '</statement><statement name="SUBSTACK2">' + posture('stand', 'stand') + '</statement></block>';
async function importProgram(blocks) {
  const fixture = JSON.parse(readFileSync('examples/microduck-movement.botlab.json', 'utf8'));
  fixture.locale = 'es';
  const chain = blocks.reduceRight((next, block) => block.replace(/\/>$/, '></block>').replace(/<\/block>$/, `${next ? `<next>${next}</next>` : ''}</block>`), '');
  fixture.workspace.content = `<xml><block type="event_whenflagclicked"><next>${chain}</next></block></xml>`;
  await page.locator('input[type=file]').setInputFiles({ name: 'repeat.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
}
const panel = () => backend === 'native' ? page.locator('section[aria-label="MuJoCo nativo (experimental)"]') : page;
async function run() {
  await page.evaluate(() => { window.repeatUpdates = []; });
  samples.length = 0;
  await panel().getByRole('button', { name: 'Ejecutar', exact: true }).click();
}
async function terminal(status) {
  if (backend === 'iframe') {
    await page.waitForFunction(s => window.repeatUpdates.some(u => u.status === s), status, { timeout: 120000 });
    return page.evaluate(() => window.repeatUpdates);
  }
  await panel().getByRole('status').filter({ hasText: { completed: 'Completado', failed: 'Error', stopped: 'Detenido' }[status] }).waitFor({ timeout: 120000 });
  assert.equal(samples.at(-1)?.program?.status, status);
  return samples.at(-1);
}
try {
  await page.addInitScript(() => {
    window.repeatUpdates = [];
    window.addEventListener('message', e => { if (e.data?.type === 'botlab.microduck.execution.v1') window.repeatUpdates.push(e.data); });
  });
  await page.goto(process.env.BOTLAB_QA_URL || 'http://127.0.0.1:4206/');
  await page.locator('.blocklySvg').first().waitFor();
  await importProgram([repeat(2, 'outer', repeat(2, 'inner', wait(2, 'nested-wait'))), repeat(2, 'toggle-loop', toggle), repeat(0, 'zero', posture('sit', 'never'))]);
  if (backend === 'native') {
    await page.getByRole('combobox', { name: 'Simulador', exact: true }).selectOption('native');
    await panel().getByRole('button', { name: 'Conectar', exact: true }).click();
    await panel().getByText('Bloques de postura disponibles', { exact: true }).waitFor();
  }
  await run();
  await panel().getByRole('status').filter({ hasText: 'Repetición 1/2 · 1/2' }).waitFor({ timeout: 90000 });
  await page.screenshot({ path: `${output}/iterations.png` });
  const completed = await terminal('completed');
  checks.decisions = backend === 'iframe' ? completed.filter(u => u.conditionResult !== undefined).map(u => u.conditionResult) : completed.program.decisions.map(d => d.result);
  assert.deepEqual(checks.decisions, [true, false]);
  checks.nestedProgress = true;
  if (backend === 'iframe') {
    const frame = await (await page.locator('iframe').elementHandle()).contentFrame();
    checks.finalPosture = await frame.evaluate(() => ({ mode: window.rl.mode, height: window.rl.data.qpos[2] }));
    assert.equal(checks.finalPosture.mode, 'walk');
  } else {
    assert.equal(completed.state.policy, 'stand');
    checks.finalPosture = { mode: completed.state.policy, height: completed.state.odom.position[2] };
  }
  assert.ok(checks.finalPosture.height >= .095);
  await importProgram([repeat(2, 'repeat-sit', posture('sit', 'sit-twice'))]);
  await run();
  const failed = await terminal('failed');
  assert.equal(backend === 'iframe' ? failed.at(-1).errorCode : failed.program.errorCode, 'posture-already-sit');
  checks.repeatedPostureError = true;
  await importProgram([repeat(3, 'cancel-loop', wait(3, 'cancel-wait')), posture('stand', 'after-stop')]);
  await run();
  await panel().getByRole('status').filter({ hasText: 'Repetición 1/3' }).waitFor({ timeout: 90000 });
  await panel().getByRole('button', { name: backend === 'native' ? 'Parar' : 'Detener', exact: true }).click();
  await terminal('stopped');
  await page.waitForTimeout(3500);
  if (backend === 'iframe') {
    const updates = await page.evaluate(() => window.repeatUpdates);
    assert.equal(updates.at(-1).status, 'stopped');
  } else assert.equal(samples.at(-1).program.status, 'stopped');
  checks.cancellation = true;
  assert.deepEqual(errors, []);
  console.log(`${backend}: nested repeats, live conditions, zero count, repeated posture error and cancellation passed.`);
} finally {
  writeFileSync(`${output}/result.json`, JSON.stringify({ backend, checks, errors, updates: await page.evaluate(() => window.repeatUpdates), statuses: await page.getByRole('status').allTextContents() }, null, 2));
  await page.screenshot({ path: `${output}/final.png` }).catch(() => {});
  writeFileSync(`${output}/page.txt`, await page.locator('body').innerText().catch(() => ''));
  await browser.close();
}
