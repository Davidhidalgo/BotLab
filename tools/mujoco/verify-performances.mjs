import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const errors = [];
let diagnosticPage;
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
  });
  diagnosticPage = page;
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
    await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 240000 });
  }
  await page.goto(process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4230');
  await page
    .getByRole('combobox', { name: /Idioma|Language/ })
    .selectOption('es');
  let beforeRun;
  for (const robot of ['jumper']) {
    const doc = JSON.parse(
      await readFile(
        `examples/${robot}-mujoco-performances.botlab.json`,
        'utf8',
      ),
    );
    await importDocument(doc);
    await load(robot);
    console.log('loaded', new Date().toISOString());
    beforeRun = (await saved()).mujocoExecution?.startedAt;
    await button('Ejecutar programa').click();
    await expect
      .poll(
        async () => {
          const current = (await saved()).mujocoExecution;
          return (
            current?.startedAt !== beforeRun &&
            ['completed', 'failed', 'cancelled'].includes(current?.status)
          );
        },
        {
          timeout: 240000,
        },
      )
      .toBe(true);
    expect((await saved()).mujocoExecution.status).toBe('completed');
    const run = (await saved()).mujocoExecution;
    console.log('completed sequence', new Date().toISOString());
    const skills = run.trace
      .filter((t) => t.result.skill)
      .map((t) => t.result.skill);
    expect(skills.map((s) => s.name)).toEqual([
      'gesture-hello',
      'gesture-bow',
      'gesture-paw',
      'gesture-salute',
      'dance-maze',
    ]);
    expect(
      skills.every(
        (s) => s.durationSeconds < 25 && s.maxJointChangeRadians >= 0.15,
      ),
    ).toBe(true);
    const move = run.trace.find((t) => t.sourceBlockId === 'advance').result;
    expect(Math.abs(move.forwardDisplacementMeters - 0.15)).toBeLessThanOrEqual(
      0.025,
    );
    await page.reload();
    expect((await saved()).mujocoExecution.trace).toEqual(run.trace);
    await load(robot);
    console.log('loaded', new Date().toISOString());
    beforeRun = (await saved()).mujocoExecution?.startedAt;
    await button('Ejecutar programa').click();
    await expect(outcome()).toHaveText('Ejecutando…');
    await page.waitForTimeout(2500);
    await button('Detener').click();
    await expect(outcome()).toHaveText('Cancelado');
    const cancelled = (await saved()).mujocoExecution;
    expect(cancelled.status).toBe('cancelled');
    beforeRun = (await saved()).mujocoExecution?.startedAt;
    await button('Ejecutar programa').click();
    await expect(outcome()).toHaveText('Ejecución fallida', { timeout: 30000 });
    expect((await saved()).mujocoExecution.trace).toHaveLength(0);
    await button('Reiniciar').click();
    beforeRun = (await saved()).mujocoExecution?.startedAt;
    await button('Ejecutar programa').click();
    await expect
      .poll(
        async () => {
          const current = (await saved()).mujocoExecution;
          return (
            current?.startedAt !== beforeRun &&
            ['completed', 'failed', 'cancelled'].includes(current?.status)
          );
        },
        {
          timeout: 240000,
        },
      )
      .toBe(true);
    expect((await saved()).mujocoExecution.status).toBe('completed');
    results.push({
      robot,
      run,
      cancellation: cancelled.status,
      resetRequiredAfterCancellation: true,
      rerunCompleted: true,
    });
    console.log(robot, 'skills passed');
  }
  expect(errors).toEqual([]);
  await writeFile(
    'docs/evidence/jumper-performances-workbench.json',
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
} catch (error) {
  console.error(await diagnosticPage?.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
}
