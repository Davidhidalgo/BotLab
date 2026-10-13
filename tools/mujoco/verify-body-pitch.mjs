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
    await readFile('examples/jumper-mujoco-body.botlab.json', 'utf8'),
  );
  await importDocument(doc);
  await load('jumper');
  await button('Ejecutar programa').click();
  await page.waitForFunction(
    () => {
      const l = JSON.parse(localStorage.getItem('botlab.projects.v1'));
      const status = l.projects.find((p) => p.id === l.activeId).document
        .mujocoExecution?.status;
      return ['completed', 'failed'].includes(status);
    },
    null,
    { timeout: 90000 },
  );
  const run = (await saved()).mujocoExecution;
  expect(run.status, JSON.stringify(run)).toBe('completed');
  const heads = run.trace.filter((t) => t.result.bodyPitch);
  expect(heads).toHaveLength(2);
  for (const [i, target] of [-0.1, 0].entries()) {
    expect(heads[i].result.bodyPitch.targetRadians).toBe(target);
    expect(
      Math.abs(heads[i].result.bodyPitch.observedRadians - target),
    ).toBeLessThanOrEqual(0.025);
  }
  const advance = run.trace.find(
    (t) => t.result.targetDistanceMeters !== undefined,
  );
  expect(
    Math.abs(advance.result.forwardDisplacementMeters - 0.15),
  ).toBeLessThanOrEqual(0.025);
  await page.reload();
  expect((await saved()).mujocoExecution.trace).toEqual(run.trace);
  await load('jumper');
  await button('Ejecutar programa').click();
  await expect(outcome()).toHaveText('Ejecutando…');
  await button('Detener').click();
  await expect(outcome()).toHaveText('Cancelado');
  const time = await page
    .getByLabel('Tiempo simulado', { exact: true })
    .textContent();
  await page.waitForTimeout(300);
  expect(
    await page.getByLabel('Tiempo simulado', { exact: true }).textContent(),
  ).toBe(time);
  await button('Cerrar sesión').click();
  const invalid = structuredClone(doc);
  invalid.workspace.content =
    '<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="start"><next><block type="botlab_web_body_pitch" id="tilt"><field name="DIRECTION">back</field><next><block type="botlab_jumper_jump" id="jump"/></next></block></next></block></xml>';
  await importDocument(invalid);
  await load('jumper');
  await button('Ejecutar programa').click();
  await expect(outcome()).toHaveText('Ejecución fallida', { timeout: 90000 });
  const rejected = (await saved()).mujocoExecution;
  expect(rejected.trace.some((t) => t.result.bodyPitch)).toBe(true);
  expect(rejected.trace.some((t) => t.result.skill)).toBe(false);
  results.push({
    robot: 'jumper',
    run,
    cancelled: true,
    tiltedJumpRejected: true,
  });
  expect(errors).toEqual([]);
  await writeFile(
    'docs/evidence/jumper-body-workbench.json',
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
