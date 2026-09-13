import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BOTLAB_PLAYWRIGHT_MODULE || 'playwright');
const external = process.env.BOTLAB_NATIVE_PRESENTATION === 'external';
const output = external ? 'tmp/native-external-qa' : 'tmp/native-app-qa';
let videoRequests = 0;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const samples = [];
const checks = {};
page.on('request', request => { if (request.url().includes(':4401/video')) videoRequests++; });
async function waitForView() {
  if (external) await page.getByText(/L’escena és oberta a BotLab Simulator|La escena está abierta en BotLab Simulator/).waitFor();
  else await page.getByRole('img', { name: 'Escena nativa de MuJoCo' }).waitFor();
}
page.on('pageerror', e => errors.push(e.message));
page.on('response', async response => {
  if (response.url().endsWith('/state') && response.ok()) {
    try {
      const { state, program, postureBusy } = await response.json();
      samples.push({ at: Date.now(), policy: state?.policy, odom: state?.odom, hz: state?.loop.hz, program, postureBusy });
    } catch { /* Page may close while a response is in flight. */ }
  }
});
const fixture = JSON.parse(readFileSync('examples/microduck-movement.botlab.json', 'utf8'));
fixture.locale = 'es';
fixture.workspace.content = '<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="start" x="32" y="32"><next><block type="botlab_microduck_walk_distance" id="walk"><field name="DISTANCE">0.25</field><next><block type="botlab_microduck_turn_degrees" id="turn"><field name="ANGLE">90</field><next><block type="control_wait" id="wait"><value name="DURATION"><shadow type="math_positive_number"><field name="NUM">1</field></shadow></value></block></next></block></next></block></next></block></xml>';
try {
  await page.goto(process.env.BOTLAB_QA_URL || 'http://127.0.0.1:4200/');
  // Default LED program must be rejected before movement.
  await page.getByRole('combobox', { name: 'Simulador', exact: true }).selectOption('native');
  await page.getByRole('button', { name: 'Connectar', exact: true }).click();
  await waitForView();
  await page.getByRole('button', { name: 'Executar', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'LED' }).waitFor();
  await page.locator('input[type=file]').setInputFiles({ name: 'native-check.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  const panel = page.locator('section[aria-label="MuJoCo nativo (experimental)"]');
  await panel.getByRole('button', { name: 'Reiniciar escena', exact: true }).click();
  await panel.getByRole('button', { name: 'Ejecutar', exact: true }).click({ timeout: 15000 });
  await panel.getByRole('status').filter({ hasText: 'Ejecutando' }).waitFor();
  await panel.getByRole('status').filter({ hasText: 'Completado' }).waitFor({ timeout: 60000 });
  assert.equal(await panel.getByRole('alert').count(), 0);
  await page.screenshot({ path: `${output}/native-completed.png` });
  checks.movement = true;
  console.log('Native movement program completed.');
  await panel.getByRole('button', { name: 'Sentarse / levantarse', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: ' · sit ·' }).waitFor({ timeout: 10000 });
  await panel.getByRole('button', { name: 'Sentarse / levantarse', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: ' · stand ·' }).waitFor({ timeout: 10000 });
  await panel.getByRole('button', { name: 'Ejecutar', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: 'Ejecutando' }).waitFor();
  await panel.getByRole('button', { name: 'Parar', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: 'Detenido' }).waitFor();
  await page.getByRole('combobox', { name: 'Simulador', exact: true }).selectOption('browser');
  assert.equal(await page.getByRole('img', { name: 'Escena nativa de MuJoCo' }).count(), 0);
  assert.ok(await page.getByRole('button', { name: 'Ejecutar en el simulador', exact: true }).count() || await page.locator('.simulator-workbench').count());
  assert.deepEqual(errors, []);
  checks.posture = checks.stop = checks.fallback = true;
  console.log('Posture, explicit stop and browser fallback passed.');
  await page.getByRole('combobox', { name: 'Simulador', exact: true }).selectOption('native');
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();
  await waitForView();
  // Isolate transport-loss acceptance from inertia left by the preceding cancelled walk.
  await panel.getByRole('button', { name: 'Reiniciar escena', exact: true }).click();
  await panel.getByRole('button', { name: 'Ejecutar', exact: true }).click({ timeout: 20000 });
  await panel.getByRole('status').filter({ hasText: 'Ejecutando' }).waitFor();
  await page.route('http://127.0.0.1:4401/**', route => route.abort());
  await new Promise(resolve => setTimeout(resolve, 3500));
  const token = 'native-acceptance-loss-check';
  const claim = await fetch('http://127.0.0.1:4401/claim', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  });
  assert.equal(claim.status, 200);
  const lost = await claim.json();
  assert.equal(lost.program.status, 'failed');
  assert.equal(lost.program.error, 'Browser connection lost.');
  assert.ok(lost.state.move.applied.every(value => Math.abs(value) < 0.001));
  await fetch('http://127.0.0.1:4401/release', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, sequence: 1 }),
  });
  if (external) assert.equal(videoRequests, 0);
  checks.presentation = { mode: external ? 'external' : 'embedded', videoRequests };
  checks.connectionLoss = { status: lost.program.status, error: lost.program.error, applied: lost.state.move.applied };
  console.log('Lost browser connection stopped native movement.');
} finally {
  writeFileSync(`${output}/result.json`, JSON.stringify({ checks, errors, samples }, null, 2));
  await browser.close();
}
