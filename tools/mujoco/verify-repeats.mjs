import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const base = process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4210';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = {
  executedAt: new Date().toISOString(),
  browser: browser.version(),
  url: base,
  robots: [],
  errors: [],
  passed: false,
};
let page;
const pending = new Set();
try {
  page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
    acceptDownloads: true,
  });
  page.setDefaultTimeout(30000);
  page.on('request', (r) => pending.add(r.url()));
  page.on('requestfinished', (r) => pending.delete(r.url()));
  page.on('requestfailed', (r) => pending.delete(r.url()));
  page.on('pageerror', (error) =>
    report.errors.push(error.stack ?? error.message),
  );
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(message.text());
  });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const outcome = () =>
    page.getByLabel('Resultado del programa', { exact: true });
  const progress = () =>
    page.getByLabel('Progreso del programa', { exact: true });
  const saved = () =>
    page.evaluate(() => {
      const library = JSON.parse(localStorage.getItem('botlab.projects.v1'));
      return library.projects.find((p) => p.id === library.activeId).document;
    });
  async function importProject(document) {
    await button('Proyectos').click();
    const file = page.waitForEvent('filechooser');
    await button('Importar proyecto').click();
    await (
      await file
    ).setFiles({
      name: 'repeat.botlab.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(document)),
    });
    await expect(page.getByRole('dialog', { name: 'Proyectos' })).toHaveCount(
      0,
    );
    await expect(button('Ejecutar programa')).toBeVisible();
  }
  async function load(robot) {
    console.log(robot, 'loading');
    await button(
      `Cargar ${robot === 'jumper' ? 'Jumper' : 'MicroDuck'}`,
    ).click();
    await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  }
  async function runComplete() {
    await button('Ejecutar programa').click();
    await expect(outcome()).toHaveText('Completado con evidencia física', {
      timeout: 120000,
    });
    await expect
      .poll(async () => (await saved()).mujocoExecution?.status)
      .toBe('completed');
    return (await saved()).mujocoExecution;
  }
  async function editCount(from, to) {
    await page
      .locator(
        '.blocklySvg > .blocklyWorkspace > .blocklyBlockCanvas .blocklyEditableField',
      )
      .filter({ hasText: new RegExp(`^${from}$`) })
      .last()
      .dblclick();
    await page.locator('.blocklyHtmlInput').fill(String(to));
    await page.locator('.blocklyHtmlInput').press('Enter');
  }
  const advances = (run) =>
    run.trace.filter((t) => t.result.targetDistanceMeters !== undefined);
  function checkMeasurements(run, count, distance) {
    const actions = advances(run);
    expect(actions).toHaveLength(count);
    expect(new Set(run.trace.map((t) => t.commandId)).size).toBe(
      run.trace.length,
    );
    for (const entry of actions) {
      expect(entry.result.targetDistanceMeters).toBe(distance);
      expect(
        Math.abs(entry.result.forwardDisplacementMeters - distance),
      ).toBeLessThanOrEqual(0.025);
    }
    return {
      trace: run.trace,
      observedMeters: actions.reduce(
        (sum, t) => sum + t.result.forwardDisplacementMeters,
        0,
      ),
      goalMeters: count * distance,
    };
  }
  await page.goto(base);
  await page
    .getByRole('combobox', { name: /Idioma|Language/ })
    .selectOption('es');
  await mkdir(resolve(root, 'output/mujoco'), { recursive: true });
  for (const robot of ['jumper', 'microduck']) {
    const example = JSON.parse(
      await readFile(
        resolve(root, `examples/${robot}-mujoco-repeat.botlab.json`),
        'utf8',
      ),
    );
    await importProject(example);
    await load(robot);
    await button('Ejecutar programa').click();
    const visible = [];
    for (let iteration = 1; iteration <= 3; iteration++) {
      await expect(progress()).toContainText(`Repetición ${iteration} de 3`, {
        timeout: 45000,
      });
      await expect(progress()).toHaveAttribute(
        'data-block-id',
        /repeat|walk|wait/,
      );
      visible.push(await progress().textContent());
      if (iteration === 2)
        await page.screenshot({
          path: resolve(root, `output/mujoco/repeat-progress-${robot}.png`),
        });
    }
    await expect(outcome()).toHaveText('Completado con evidencia física', {
      timeout: 90000,
    });
    await expect
      .poll(async () => (await saved()).mujocoExecution?.trace.length)
      .toBe(9);
    const three = (await saved()).mujocoExecution;
    const threeMeasurements = checkMeasurements(three, 3, 0.5);
    expect(
      advances(three).map((t) => t.iterations.map((i) => i.iteration)),
    ).toEqual([[1], [2], [3]]);
    await expect(
      page.getByLabel('Avance acumulado: observado / objetivo', {
        exact: true,
      }),
    ).toContainText('/ 1.50 m');
    const rows = page.getByLabel('Lo que ha hecho el robot').locator('li');
    await expect(rows).toHaveCount(3);
    for (let i = 0; i < 3; i++)
      await expect(rows.nth(i)).toContainText(`Repetición ${i + 1} de 3`);
    await button('Detener').click();
    await page.screenshot({
      path: resolve(root, `output/mujoco/repeat-completed-${robot}.png`),
    });
    console.log(robot, '3 repetitions', threeMeasurements.observedMeters);

    // Persistence, JSON export/import, and legacy examples must remain usable.
    await page.reload();
    await expect(outcome()).toHaveText('Completado con evidencia física');
    expect((await saved()).mujocoExecution.trace).toEqual(three.trace);
    await expect.poll(() => page.workers().length).toBe(0);
    await button('Proyectos').click();
    const download = page.waitForEvent('download');
    await button('Exportar proyecto').click();
    const exported = JSON.parse(
      await readFile(await (await download).path(), 'utf8'),
    );
    await page.keyboard.press('Escape');
    await importProject(exported);
    await expect(outcome()).toHaveText('Completado con evidencia física');
    expect((await saved()).mujocoExecution.trace).toEqual(three.trace);

    await editCount(3, 2);
    await expect(outcome()).toHaveText('Listo para ejecutar');
    await load(robot);
    const two = await runComplete();
    const twoMeasurements = checkMeasurements(two, 2, 0.5);
    await expect(
      page.getByLabel('Avance acumulado: observado / objetivo', {
        exact: true,
      }),
    ).toContainText('/ 1.00 m');
    console.log(robot, '2 repetitions', twoMeasurements.observedMeters);

    // Stopping during a later iteration must not dispatch later iterations.
    await editCount(2, 3);
    await button('Reiniciar').click();
    await expect(page.getByLabel('Estado de la física')).toContainText(
      'Preparada',
    );
    await button('Ejecutar programa').click();
    await expect(progress()).toContainText('Repetición 2 de 3', {
      timeout: 45000,
    });
    await button('Detener').click();
    await expect(outcome()).toHaveText('Cancelado');
    await expect(button('Ejecutar programa')).toBeEnabled();
    await expect
      .poll(async () => (await saved()).mujocoExecution?.status)
      .toBe('cancelled');
    const cancelled = (await saved()).mujocoExecution;
    expect(
      cancelled.trace.some((t) => t.iterations?.some((i) => i.iteration === 3)),
    ).toBe(false);
    const stoppedTime = await page.getByLabel('Tiempo simulado').textContent();
    await page.waitForTimeout(300);
    expect(await page.getByLabel('Tiempo simulado').textContent()).toBe(
      stoppedTime,
    );
    await expect(page.getByLabel('Estado de la física')).toContainText(
      'Pausada',
    );

    // Source edits cancel the exact active program and erase its stale result.
    await button('Reiniciar').click();
    await expect(page.getByLabel('Estado de la física')).toContainText(
      'Preparada',
    );
    await button('Ejecutar programa').click();
    await expect(progress()).toContainText('Repetición 1 de 3');
    await editCount(3, 4);
    await expect(outcome()).toHaveText('Listo para ejecutar');
    await expect(button('Ejecutar programa')).toBeEnabled();
    await expect(page.getByLabel('Estado de la física')).toContainText(
      'Pausada',
    );
    await expect
      .poll(async () => (await saved()).mujocoExecution ?? null)
      .toBeNull();
    await editCount(4, 0);
    const beforeZero = await page.getByLabel('Tiempo simulado').textContent();
    await button('Ejecutar programa').click();
    await expect(outcome()).toHaveText(
      'Sin acciones que ejecutar (repetición cero).',
    );
    await expect
      .poll(async () => (await saved()).mujocoExecution?.status)
      .toBe('no-work');
    const zero = (await saved()).mujocoExecution;
    expect(zero.trace).toEqual([]);
    expect(zero.outcome.evidence).toBe('none');
    expect(await page.getByLabel('Tiempo simulado').textContent()).toBe(
      beforeZero,
    );
    await page.reload();
    await expect(outcome()).toHaveText(
      'Sin acciones que ejecutar (repetición cero).',
    );

    // A nested program exercises repeated identity through the complete editor/runtime/worker path.
    const wrap = (id, count, body) =>
      `<block type="control_repeat" id="${id}"><value name="TIMES"><shadow type="math_whole_number"><field name="NUM">${count}</field></shadow></value><statement name="SUBSTACK">${body}</statement></block>`;
    const distance =
      '<block type="botlab_microduck_walk_distance" id="nested-walk"><field name="DISTANCE">0.1</field></block>';
    const withBody = (body) => ({
      ...example,
      workspace: {
        ...example.workspace,
        content: `<xml><block type="event_whenflagclicked" id="start"><next>${body}</next></block></xml>`,
      },
    });
    await importProject(withBody(wrap('outer', 2, wrap('inner', 2, distance))));
    await load(robot);
    const nested = await runComplete();
    checkMeasurements(nested, 4, 0.1);
    expect(
      advances(nested).map((t) => t.iterations.map((i) => i.iteration)),
    ).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ]);
    await expect(page.getByLabel('Lo que ha hecho el robot')).toContainText(
      'Repetición 2 de 2 → Repetición 2 de 2',
    );

    await importProject(withBody(wrap('empty', 3, '')));
    await load(robot);
    const empty = await runComplete();
    expect(empty.trace).toHaveLength(3);
    expect(empty.trace.map((t) => t.iterations[0].iteration)).toEqual([
      1, 2, 3,
    ]);

    await importProject(withBody(wrap('outer', 100, wrap('inner', 100, ''))));
    await load(robot);
    await button('Ejecutar programa').click();
    await expect(page.getByRole('alert')).toContainText('supera 256 pasos');
    await expect(page.getByLabel('Estado de la física')).toContainText(
      'Preparada',
    );
    expect((await saved()).mujocoExecution).toBeUndefined();

    const legacy = JSON.parse(
      await readFile(
        resolve(root, `examples/${robot}-mujoco-first-steps.botlab.json`),
        'utf8',
      ),
    );
    await importProject(legacy);
    await load(robot);
    const old = await runComplete();
    expect(old.trace).toHaveLength(robot === 'jumper' ? 2 : 3);
    expect(old.trace.every((t) => !t.iterations)).toBe(true);
    await button('Cerrar sesión').click();
    await expect.poll(() => page.workers().length).toBe(0);
    report.robots.push({
      robot,
      visible,
      three: threeMeasurements,
      two: twoMeasurements,
      nested: nested.trace,
      cancelledTrace: cancelled.trace,
      zero: zero.outcome,
      empty: empty.trace,
      checks: [
        'iteration progress and distinct result rows',
        'JSON export/import and reload retain identities',
        '3 to 2 repetitions changes measured total',
        'stop on second iteration prevents third',
        'editing cancels and invalidates result',
        'zero count has no commands or physics advancement',
        'nested iteration paths',
        'empty bodies have bounded checkpoints',
        'expansion budget rejected before physics',
        'legacy first-steps project completes',
        'close releases worker',
      ],
    });
    console.log(robot, 'all repeat checks passed');
  }
  expect(report.errors).toEqual([]);
  report.passed = true;
} catch (error) {
  report.failure = String(error);
  report.pendingRequests = [...pending];
  console.log('pending requests', report.pendingRequests);
  console.error(error);
  process.exitCode = 1;
  if (page && !page.isClosed())
    await page
      .screenshot({ path: resolve(root, 'output/mujoco/repeat-failure.png') })
      .catch(() => {});
} finally {
  await writeFile(
    resolve(root, 'docs/evidence/mujoco-repeat-validation.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
}
