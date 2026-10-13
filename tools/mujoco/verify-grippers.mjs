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
      await readFile(`examples/${robot}-mujoco-grippers.botlab.json`, 'utf8'),
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
    const grippers = run.trace
      .filter((t) => t.result.gripper)
      .map((t) => t.result.gripper);
    expect(grippers.map((g) => g.action)).toEqual([
      'prepare-left',
      'close',
      'open',
      'stow',
      'prepare-right',
      'close',
      'open',
      'stow',
    ]);
    expect(grippers.every((g) => g.maxJointErrorRadians <= 0.07)).toBe(true);
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
    await page.waitForFunction(
      () =>
        Number(
          document
            .querySelector('[data-testid="root-position"]')
            ?.textContent?.match(/-?\d+\.\d+/g)
            ?.at(-1),
        ) > 0.095,
    );
    await page.waitForTimeout(600);
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
    const rejections = [];
    for (const action of ['walk', 'closed-stow']) {
      await button('Cerrar sesión').click();
      const invalid = structuredClone(doc);
      const tail =
        action === 'walk'
          ? '<block type="botlab_web_advance_cm" id="invalid"><field name="CM">15</field></block>'
          : '<block type="botlab_jumper_gripper" id="close"><field name="ACTION">close</field><next><block type="botlab_jumper_gripper" id="invalid"><field name="ACTION">stow</field></block></next></block>';
      invalid.workspace.content = `<xml><block type="event_whenflagclicked" id="start"><next><block type="botlab_jumper_gripper" id="prepare"><field name="ACTION">prepare-left</field><next>${tail}</next></block></next></block></xml>`;
      await importDocument(invalid);
      await load(robot);
      await button('Ejecutar programa').click();
      await expect(outcome()).toHaveText('Ejecución fallida', {
        timeout: 60000,
      });
      const rejection = (await saved()).mujocoExecution;
      expect(rejection.trace.some((t) => t.sourceBlockId === 'prepare')).toBe(
        true,
      );
      expect(rejection.trace.some((t) => t.sourceBlockId === 'invalid')).toBe(
        false,
      );
      rejections.push({ action, report: rejection });
    }
    results.push({
      robot,
      run,
      cancellation: cancelled.status,
      resetRequiredAfterCancellation: true,
      rerunCompleted: true,
      rejections,
    });
    console.log(robot, 'grippers passed');
  }
  expect(errors).toEqual([]);
  await writeFile(
    'docs/evidence/jumper-grippers-workbench.json',
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
