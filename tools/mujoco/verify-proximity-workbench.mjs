import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
  async function complete() {
    await button('Ejecutar programa').click();
    await expect(outcome()).toHaveText('Completado con evidencia física', {
      timeout: 120000,
    });
    await expect
      .poll(async () => (await saved()).mujocoExecution?.status)
      .toBe('completed');
    return (await saved()).mujocoExecution;
  }
  await page.goto(process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4230');
  await page
    .getByRole('combobox', { name: /Idioma|Language/ })
    .selectOption('es');
  for (const robot of ['microduck', 'jumper']) {
    const doc = JSON.parse(
      await readFile(`examples/${robot}-mujoco-proximity.botlab.json`, 'utf8'),
    );
    await importDocument(doc);
    await expect(
      page.getByRole('combobox', { name: 'Escena', exact: true }),
    ).toHaveValue('obstacles');
    await load(robot);
    const run = await complete();
    const moves = run.trace.filter(
        (t) => t.result.targetDistanceMeters !== undefined,
      ),
      checks = run.trace.filter((t) => t.result.proximity);
    expect(moves.length).toBeGreaterThan(1);
    expect(checks.length).toBe(moves.length + 1);
    expect(checks.at(-1).result.proximity.value).toBe(true);
    for (const move of moves) {
      expect(move.result.targetDistanceMeters).toBe(0.15);
      expect(
        Math.abs(move.result.forwardDisplacementMeters - 0.15),
      ).toBeLessThanOrEqual(0.025);
    }
    for (const check of checks)
      expect(check.result.proximity.capturedAtSeconds).toBe(
        check.result.timeSeconds,
      );
    await expect(
      page
        .getByRole('list', {
          name: 'Comprobaciones de la condición',
          exact: true,
        })
        .getByRole('listitem'),
    ).toHaveCount(checks.length);
    await mkdir('output/mujoco', { recursive: true });
    await page.screenshot({
      path: `output/mujoco/${robot}-proximity.png`,
      fullPage: true,
    });
    const initialTrue = await complete();
    expect(initialTrue.trace).toHaveLength(1);
    expect(initialTrue.trace[0].result.proximity.value).toBe(true);
    await page.reload();
    await expect(page.getByTestId('tof-panel')).toHaveCount(0);
    expect(
      (await saved()).mujocoExecution.trace[0].result.proximity.value,
    ).toBe(true);
    await load(robot);
    await button('Ejecutar programa').click();
    await expect(outcome()).toHaveText('Ejecutando…');
    await button('Detener').click();
    await expect(outcome()).toHaveText('Cancelado');
    await expect(
      page.getByLabel('Estado de la física', { exact: true }),
    ).toContainText('Pausada');
    const stopped = await page.getByTestId('tof-time').textContent();
    await page.waitForTimeout(200);
    expect(await page.getByTestId('tof-time').textContent()).toBe(stopped);
    await button('Cerrar sesión').click();
    const noSensor = { ...doc, simulationScene: 'flat' };
    await importDocument(noSensor);
    await load(robot);
    await button('Ejecutar programa').click();
    await expect(page.getByRole('alert')).toContainText(
      'Selecciona Obstáculos + ToF',
    );
    expect((await saved()).mujocoExecution).toBeUndefined();
    await button('Cerrar sesión').click();
    results.push({
      robot,
      run,
      initialTrue,
      cancelled: true,
      missingSensorRejected: true,
    });
    console.log(robot, 'passed');
  }
  // A false condition with an empty body must terminate with a visible budget error.
  const doc = JSON.parse(
    await readFile('examples/microduck-mujoco-proximity.botlab.json', 'utf8'),
  );
  doc.workspace.content = doc.workspace.content
    .replace('<field name="CM">30</field>', '<field name="CM">5</field>')
    .replace(/<statement name="SUBSTACK">.*?<\/statement>/, '');
  await importDocument(doc);
  await load('microduck');
  await button('Ejecutar programa').click();
  await expect(outcome()).toHaveText('Ejecución fallida', { timeout: 30000 });
  await expect(page.getByRole('alert')).toContainText('256');
  await button('Cerrar sesión').click();
  expect(errors).toEqual([]);
  await writeFile(
    'docs/evidence/mujoco-proximity-workbench.json',
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        results,
        emptyLoopBounded: true,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
