import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.BOTLAB_PLAYWRIGHT_MODULE || 'playwright',
);
const output = 'tmp/native-posture-qa';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const samples = [],
  errors = [];
const checks = {};
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', async (response) => {
  if (response.url().endsWith('/state') && response.ok()) {
    try {
      samples.push({ at: Date.now(), ...(await response.json()) });
    } catch {
      /* closing */
    }
  }
});
function document(blocks) {
  const fixture = JSON.parse(
    readFileSync('examples/microduck-movement.botlab.json', 'utf8'),
  );
  fixture.locale = 'es';
  let next = '';
  for (const { type, id, inner = '' } of [...blocks].reverse())
    next = `<block type="${type}" id="${id}">${inner}${next ? `<next>${next}</next>` : ''}</block>`;
  fixture.workspace.content = `<xml><block type="event_whenflagclicked" id="flag"><next>${next}</next></block></xml>`;
  return {
    name: 'posture-check.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  };
}
const posture = (value, id) => ({ type: `botlab_microduck_${value}`, id });
function xml(block) {
  return `<block type="${block.type}" id="${block.id}">${block.inner || ''}</block>`;
}
const condition = (value, id, yes, no) => ({
  type: no ? 'control_if_else' : 'control_if',
  id,
  inner:
    `<value name="CONDITION"><block type="botlab_microduck_is_${value}" id="${id}-predicate"/></value>` +
    (yes ? `<statement name="SUBSTACK">${xml(yes)}</statement>` : '') +
    (no ? `<statement name="SUBSTACK2">${xml(no)}</statement>` : ''),
});
const wait = (seconds, id) => ({
  type: 'control_wait',
  id,
  inner: `<value name="DURATION"><shadow type="math_positive_number"><field name="NUM">${seconds}</field></shadow></value>`,
});
const panel = page.locator(
  'section[aria-label="MuJoCo nativo (experimental)"]',
);
async function importProgram(blocks) {
  await page.locator('input[type=file]').setInputFiles(document(blocks));
}
try {
  await page.goto(process.env.BOTLAB_QA_URL || 'http://127.0.0.1:4200/');
  await page
    .getByRole('combobox', { name: 'Simulador', exact: true })
    .selectOption('native');
  await page.getByRole('button', { name: 'Connectar', exact: true }).click();
  await page
    .getByText('Blocs de postura disponibles', { exact: true })
    .waitFor();
  await importProgram([
    condition(
      'sit',
      'choose-initial',
      posture('stand', 'must-not-run'),
      posture('sit', 'sit'),
    ),
    condition(
      'sit',
      'nested-outer',
      condition('sit', 'nested-inner', posture('stand', 'stand')),
    ),
    {
      type: 'botlab_microduck_walk_distance',
      id: 'walk',
      inner: '<field name="DISTANCE">0.25</field>',
    },
    condition('stand', 'choose-final', posture('sit', 'final-sit')),
    condition(
      'transitioning',
      'check-stable',
      posture('stand', 'must-not-rise'),
      wait(0, 'done'),
    ),
  ]);
  await page
    .getByRole('combobox', { name: 'Simulador', exact: true })
    .selectOption('native');
  await panel
    .getByText('Bloques de postura disponibles', { exact: true })
    .waitFor();
  await panel
    .getByRole('button', { name: 'Reiniciar escena', exact: true })
    .click({ timeout: 20000 });
  await panel
    .getByRole('button', { name: 'Ejecutar', exact: true })
    .click({ timeout: 20000 });
  await panel
    .getByRole('status')
    .filter({ hasText: 'Completado' })
    .waitFor({ timeout: 70000 });
  assert.equal(await panel.getByRole('alert').count(), 0);
  const completed = samples.at(-1);
  assert.equal(completed.state.policy, 'sit');
  assert.ok(completed.state.odom.position[2] < 0.085);
  checks.sequence = true;
  checks.capabilities = completed.capabilities;
  assert.deepEqual(
    completed.program.decisions.map((d) => [d.sourceBlockId, d.result]),
    [
      ['choose-initial', false],
      ['nested-outer', true],
      ['nested-inner', true],
      ['choose-final', true],
      ['check-stable', false],
    ],
  );
  checks.decisions = completed.program.decisions;
  assert.equal(
    await panel
      .getByRole('list', { name: 'Condición' })
      .getByRole('listitem')
      .count(),
    5,
  );
  await page.screenshot({ path: `${output}/completed.png` });
  await importProgram([
    posture('sit', 'redundant-sit'),
    {
      type: 'botlab_microduck_walk_distance',
      id: 'must-not-walk',
      inner: '<field name="DISTANCE">1</field>',
    },
  ]);
  await panel.getByRole('button', { name: 'Ejecutar', exact: true }).click();
  await panel
    .getByRole('alert')
    .filter({ hasText: 'El robot ya está sentado' })
    .waitFor();
  const failed = samples.at(-1);
  assert.equal(failed.program.status, 'failed');
  assert.equal(failed.program.step.sourceBlockId, 'redundant-sit');
  assert.equal(failed.program.index, 0);
  assert.equal(failed.state.policy, 'sit');
  checks.redundantPostureError = true;
  await page.screenshot({ path: `${output}/posture-error.png` });
  console.log('Posture sequence completed in physical sit.');
  await importProgram([
    posture('stand', 'cancel-rise'),
    {
      type: 'botlab_microduck_walk_distance',
      id: 'must-not-run',
      inner: '<field name="DISTANCE">1</field>',
    },
  ]);
  await panel.getByRole('button', { name: 'Ejecutar', exact: true }).click();
  await page.waitForTimeout(400);
  await panel.getByRole('button', { name: 'Parar', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: 'Detenido' }).waitFor();
  await page.waitForTimeout(4500);
  const stopped = samples.at(-1);
  assert.equal(stopped.program.status, 'stopped');
  assert.equal(stopped.program.index, 0);
  assert.ok(stopped.state.move.applied.every((x) => Math.abs(x) < 0.001));
  assert.equal(stopped.postureBusy, false);
  checks.stop = {
    index: stopped.program.index,
    policy: stopped.state.policy,
    height: stopped.state.odom.position[2],
  };
  await panel.getByRole('button', { name: 'Desconectar', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    'Cancellation held sequence; native transition settled without starting walk.',
  );
} finally {
  writeFileSync(
    `${output}/page.txt`,
    await page
      .locator('body')
      .innerText()
      .catch(() => 'closed'),
  );
  await page.screenshot({ path: `${output}/final.png` }).catch(() => {});
  writeFileSync(
    `${output}/result.json`,
    JSON.stringify({ checks, errors, samples }, null, 2),
  );
  await browser.close();
}
