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
  for (const robot of ['microduck', 'jumper']) {
    const doc = JSON.parse(
      await readFile(`examples/${robot}-mujoco-proximity.botlab.json`, 'utf8'),
    );
    doc.simulationScene = 'flat';
    doc.workspace.content =
      '<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="start"><next><block type="botlab_web_velocity" id="walk"><field name="FORWARD">0.24</field><field name="YAW">0</field><field name="SECONDS">2</field><next><block type="botlab_web_rest" id="stop"><next><block type="botlab_web_advance_cm" id="advance"><field name="CM">15</field></block></next></block></next></block></next></block></xml>';
    await importDocument(doc);
    await load(robot);
    await button('Ejecutar programa').click();
    await expect
      .poll(async () => (await saved()).mujocoExecution?.status, {
        timeout: 90000,
      })
      .toBe('completed');
    const run = (await saved()).mujocoExecution;
    const rest = run.trace.find((t) => t.result.rest).result.rest;
    expect(rest.durationSeconds).toBeGreaterThanOrEqual(0.8);
    expect(rest.driftMeters).toBeLessThanOrEqual(0.01);
    expect(rest.rotationRadians).toBeLessThanOrEqual(0.05);
    const move = run.trace.find((t) => t.sourceBlockId === 'advance').result;
    expect(Math.abs(move.forwardDisplacementMeters - 0.15)).toBeLessThanOrEqual(
      0.025,
    );
    await page.reload();
    expect((await saved()).mujocoExecution.trace).toEqual(run.trace);
    results.push({ robot, run });
    console.log(robot, 'measured rest passed');
  }
  expect(errors).toEqual([]);
  await writeFile(
    'docs/evidence/mujoco-rest-workbench.json',
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
