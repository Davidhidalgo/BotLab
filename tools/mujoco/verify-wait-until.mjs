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
    const original = JSON.parse(
      await readFile(`examples/${robot}-mujoco-proximity.botlab.json`, 'utf8'),
    );
    for (const [threshold, expected] of [
      [200, 'completed'],
      [30, 'failed'],
    ]) {
      const doc = structuredClone(original);
      doc.workspace.content = `<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="start"><next><block type="botlab_web_wait_until" id="await"><field name="SECONDS">1</field><value name="CONDITION"><block type="botlab_web_obstacle" id="sensor"><field name="CM">${threshold}</field></block></value></block></next></block></xml>`;
      await importDocument(doc);
      await load(robot);
      await button('Ejecutar programa').click();
      await expect
        .poll(async () => (await saved()).mujocoExecution?.status, {
          timeout: 30000,
        })
        .toBe(expected);
      const run = (await saved()).mujocoExecution;
      const checks = run.trace.filter((t) => t.result.proximity);
      expect(checks).toHaveLength(expected === 'completed' ? 1 : 3);
      if (expected === 'failed') {
        await expect(page.getByRole('alert')).toContainText('tiempo máximo');
        expect(
          checks.at(-1).result.timeSeconds - checks[0].result.timeSeconds,
        ).toBeGreaterThanOrEqual(1);
      }
      expect(
        run.trace.some((t) => t.result.targetDistanceMeters !== undefined),
      ).toBe(false);
      results.push({ robot, expected, run });
      await button('Cerrar sesión').click();
    }
    console.log(robot, 'conditional wait passed');
  }
  expect(errors).toEqual([]);
  await writeFile(
    'docs/evidence/mujoco-wait-until.json',
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
