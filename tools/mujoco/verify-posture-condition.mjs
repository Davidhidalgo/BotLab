import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
  });
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.message));
  const button = (name) => page.getByRole('button', { name, exact: true });
  const outcome = () =>
    page.getByLabel('Resultado del programa', { exact: true });
  const saved = () =>
    page.evaluate(() => {
      const l = JSON.parse(localStorage.getItem('botlab.projects.v1'));
      return l.projects.find((p) => p.id === l.activeId).document;
    });
  async function importDocument(doc) {
    await button('Proyectos').click();
    const chooser = page.waitForEvent('filechooser');
    await button('Importar proyecto').click();
    await (
      await chooser
    ).setFiles({
      name: 'proximity.botlab.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await expect(page.getByRole('dialog', { name: 'Proyectos' })).toHaveCount(
      0,
    );
  }
  async function load(robot) {
    await button(
      'Cargar ' + (robot === 'jumper' ? 'Jumper' : 'MicroDuck'),
    ).click();
    await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  }
  await page.goto(process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4230');
  await page
    .getByRole('combobox', { name: /Idioma|Language/ })
    .selectOption('es');
  const doc = JSON.parse(
    await readFile('examples/microduck-mujoco-posture.botlab.json', 'utf8'),
  );
  doc.simulationScene = 'flat';
  doc.workspace.content =
    '<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="start"><next><block type="botlab_microduck_sit" id="sit"><next><block type="control_if" id="if"><value name="CONDITION"><block type="botlab_microduck_is_sit" id="is-sit"/></value><statement name="SUBSTACK"><block type="botlab_microduck_stand" id="stand"/></statement><next><block type="botlab_web_advance_cm" id="move"><field name="CM">15</field></block></next></block></next></block></next></block></xml>';
  await importDocument(doc);
  await load('microduck');
  await button('Ejecutar programa').click();
  await expect
    .poll(async () => (await saved()).mujocoExecution?.status, {
      timeout: 90000,
    })
    .toBe('completed');
  const run = (await saved()).mujocoExecution;
  const decision = run.trace.find((t) => t.result.decision).result;
  expect(decision.decision.value).toBe(true);
  expect(decision.postureObservation.state).toBe('sit');
  expect(decision.proximity).toBeUndefined();
  expect(run.trace.some((t) => t.sourceBlockId === 'stand')).toBe(true);
  const move = run.trace.find((t) => t.sourceBlockId === 'move').result;
  expect(Math.abs(move.forwardDisplacementMeters - 0.15)).toBeLessThanOrEqual(
    0.025,
  );
  await page.reload();
  expect((await saved()).mujocoExecution.trace).toEqual(run.trace);
  results.push({ robot: 'microduck', run, flatScene: true });
  expect(errors).toEqual([]);
  await writeFile(
    'docs/evidence/microduck-posture-condition.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        results,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
