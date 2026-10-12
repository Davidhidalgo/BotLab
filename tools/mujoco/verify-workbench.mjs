import { chromium, firefox, webkit, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const base = process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4210';
const browserName = process.env.BOTLAB_BROWSER ?? 'chrome';
const browserType = { chrome: chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error('Unknown browser');
const browser = await browserType.launch({
  ...(browserName === 'chrome' ? { channel: 'chrome' } : {}),
  headless: true,
});
let page;
try {
  page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
    acceptDownloads: true,
  });
  page.setDefaultTimeout(30000);
  const errors = [],
    engineRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/mujoco.*\.wasm|ort-wasm|simulation-assets/.test(request.url()))
      engineRequests.push(request.url());
  });
  const button = (name) => page.getByRole('button', { name, exact: true });
  const robot = () =>
    page.getByRole('combobox', { name: 'Robot', exact: true });
  const simulator = () =>
    page.getByRole('combobox', { name: 'Simulador', exact: true });
  const outcome = () =>
    page.getByLabel('Resultado del programa', { exact: true });
  const saved = () =>
    page.evaluate(() => {
      const library = JSON.parse(localStorage.getItem('botlab.projects.v1'));
      return library.projects.find((project) => project.id === library.activeId)
        .document;
    });
  const saveExample = async (name) => {
    const document = await saved();
    const example = {
      schemaVersion: 1,
      locale: 'es',
      targetId: document.targetId,
      simulatorBackend: 'mujoco',
      workspace: {
        ...document.workspace,
        status: 'loaded',
        content: document.workspace.content.replace(
          /(<shadow[^>]*?) id="[^"]*"/g,
          '$1',
        ),
      },
    };
    await writeFile(
      resolve(root, `examples/${name}-mujoco-first-steps.botlab.json`),
      JSON.stringify(example, null, 2) + '\n',
    );
  };
  const edit = async (from, to) => {
    await page
      .locator(
        '.blocklySvg > .blocklyWorkspace > .blocklyBlockCanvas .blocklyEditableField',
      )
      .filter({ hasText: from })
      .last()
      .dblclick();
    await page.locator('.blocklyHtmlInput').fill(to);
    await page.locator('.blocklyHtmlInput').press('Enter');
  };
  await page.goto(base);
  await page
    .getByRole('combobox', { name: /Idioma|Language/ })
    .selectOption('es');
  await page.waitForTimeout(300);
  expect(engineRequests).toHaveLength(0);
  console.log(browserName, 'editor ready');
  const original = (await saved()).workspace.content;
  await robot().selectOption('jumper');
  await expect(simulator()).toHaveValue('mujoco');
  await expect(simulator().locator('option')).toHaveCount(1);
  await expect(page.locator('.workbench-advanced')).not.toHaveAttribute('open');
  await expect(
    page
      .locator('.blocklyToolboxCategoryLabel')
      .filter({ hasText: /^Avanzado$/ }),
  ).toBeVisible();
  await saveExample('jumper');
  await button('Cargar Jumper').click();
  await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  await button('Ejecutar programa').click();
  await expect(outcome()).toHaveText('Ejecutando…');
  await expect(robot()).toBeDisabled();
  await expect(outcome()).toHaveText('Completado con evidencia física', {
    timeout: 60000,
  });
  await expect
    .poll(async () => (await saved()).mujocoExecution?.status)
    .toBe('completed');
  console.log(browserName, 'Jumper walking completed');
  const completed = (await saved()).mujocoExecution;
  expect(completed.trace).toHaveLength(2);
  expect(completed.trace[0].result.targetDistanceMeters).toBe(0.5);
  expect(
    Math.abs(completed.trace[0].result.forwardDisplacementMeters - 0.5),
  ).toBeLessThanOrEqual(0.025);
  await expect(page.getByLabel('Lo que ha hecho el robot')).toContainText(
    '0.50 m',
  );
  await page.reload();
  await expect(outcome()).toHaveText('Completado con evidencia física');
  await expect(button('Cargar Jumper')).toBeEnabled();
  await expect.poll(() => page.workers().length).toBe(0);
  expect((await saved()).mujocoExecution.outcome.executionId).toBe(
    completed.outcome.executionId,
  );
  await edit('1', '2');
  await expect(outcome()).toHaveText('Listo para ejecutar');
  await expect
    .poll(async () => (await saved()).mujocoExecution ?? null)
    .toBeNull();
  const edited = (await saved()).workspace.content;
  await page.getByText('Opciones avanzadas', { exact: true }).click();
  await page
    .getByLabel('Modo de Jumper', { exact: true })
    .selectOption('jumper-web-joint-probe');
  await expect(
    page.getByText(
      'Cuerpo fijado para probar articulaciones. Este modo no comprueba el equilibrio.',
    ),
  ).toBeVisible();
  await button('Cargar Jumper').click();
  await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  await button('Ejecutar programa').click();
  await expect(outcome()).toHaveText('Completado con evidencia física', {
    timeout: 30000,
  });
  await page
    .getByLabel('Modo de Jumper', { exact: true })
    .selectOption('jumper-web-walking');
  await expect.poll(async () => (await saved()).workspace.content).toBe(edited);
  await expect.poll(() => page.workers().length).toBe(0);
  console.log(browserName, 'Jumper joint test completed');
  await robot().selectOption('stackchan');
  await expect
    .poll(async () => (await saved()).workspace.content)
    .toBe(original);
  await robot().selectOption('microduck');
  await expect(simulator().locator('option')).toHaveCount(1);
  await expect(page.locator('iframe')).toHaveCount(0);
  await saveExample('microduck');
  await button('Cargar MicroDuck').click();
  await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  await button('Ejecutar programa').click();
  await expect(outcome()).toHaveText('Completado con evidencia física', {
    timeout: 60000,
  });
  await expect
    .poll(async () => (await saved()).mujocoExecution?.trace.length)
    .toBe(3);
  const duckTrace = (await saved()).mujocoExecution.trace;
  expect(
    Math.abs(duckTrace[0].result.forwardDisplacementMeters - 0.5),
  ).toBeLessThanOrEqual(0.025);
  expect(
    Math.abs(duckTrace[1].result.yawRadians - Math.PI / 2),
  ).toBeLessThanOrEqual((5 * Math.PI) / 180);
  await expect(page.getByLabel('Lo que ha hecho el robot')).toContainText(
    '90°',
  );
  await button('Detener').click();
  await expect(page.getByLabel('Estado de la física')).toContainText('Pausada');
  await mkdir(resolve(root, 'output/mujoco'), { recursive: true });
  await page.screenshot({ path: resolve(root, 'output/mujoco/workbench.png') });
  await robot().selectOption('jumper');
  await expect.poll(() => page.workers().length).toBe(0);
  await robot().selectOption('microduck');
  await expect(outcome()).toHaveText('Completado con evidencia física');
  console.log(browserName, 'MicroDuck completed');
  await button('Proyectos').click();
  const dialog = page.getByRole('dialog', { name: 'Proyectos' });
  await expect(dialog).toBeVisible();
  await page.getByLabel('Nombre del proyecto').fill('Mis robots');
  await button('Guardar nombre').click();
  await page.screenshot({
    path: resolve(root, `output/mujoco/projects-${browserName}.png`),
  });
  // Native modal focus containment, dismissal and return to the opener.
  for (let i = 0; i < 18; i++) {
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(button('Proyectos')).toBeFocused();
  await button('Proyectos').click();
  const downloadPromise = page.waitForEvent('download');
  await button('Exportar proyecto').click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(
    exported.targetWorkspaces['jumper-web-joint-probe'].mujocoExecution.status,
  ).toBe('completed');
  expect(exported.mujocoExecution.status).toBe('completed');
  await writeFile(
    resolve(root, 'tmp/mujoco-workbench-export.json'),
    JSON.stringify(exported),
  );
  await button('Nuevo proyecto').click();
  await expect(robot()).toHaveValue('microduck');
  const blank = await page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('botlab.projects.v1'));
    return library.projects.find((project) => project.id === library.activeId);
  });
  await button('Proyectos').click();
  const chooseFile = page.waitForEvent('filechooser');
  await button('Importar proyecto').click();
  await (
    await chooseFile
  ).setFiles({
    name: 'botlab-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(robot()).toHaveValue('microduck');
  await expect(simulator()).toHaveValue('mujoco');
  await expect(outcome()).toHaveText('Completado con evidencia física');
  await expect.poll(() => page.workers().length).toBe(0);
  expect(
    await page.evaluate((id) => {
      const library = JSON.parse(localStorage.getItem('botlab.projects.v1'));
      return library.projects.find((project) => project.id === id).document
        .workspace.content;
    }, blank.id),
  ).toBe(blank.document.workspace.content);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('botlab.projects.v1')).projects.length,
    ),
  ).toBe(3);
  await button('Proyectos').click();
  await button('Duplicar').click();
  const projectIds = await page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('botlab.projects.v1'));
    return { count: library.projects.length, activeId: library.activeId };
  });
  expect(projectIds.count).toBe(4);
  await button('Proyectos').click();
  await button('Eliminar').click();
  await button('Cancelar').click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('botlab.projects.v1')).activeId,
    ),
  ).toBe(projectIds.activeId);
  await button('Eliminar').click();
  await button('Eliminar definitivamente').click();
  await expect(dialog).toHaveCount(0);
  await button('Proyectos').click();
  await dialog.getByRole('button', { name: /Mis robots/ }).click();
  await button('Abrir proyecto').click();
  await expect(simulator()).toHaveValue('mujoco');
  await button('Cargar MicroDuck').click();
  await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  await button('Ejecutar programa').click();
  await expect(outcome()).toHaveText('Ejecutando…');
  await expect
    .poll(async () => (await saved()).mujocoExecution?.status)
    .toBe('running');
  await page.reload();
  await expect(outcome()).toHaveText('Interrumpido al cerrar la aplicación');
  await expect.poll(() => page.workers().length).toBe(0);
  await robot().selectOption('jumper');
  await button('Cargar Jumper').click();
  await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  await button('Ejecutar programa').click();
  await expect(outcome()).toHaveText('Ejecutando…');
  await edit('2', '3');
  await expect(outcome()).toHaveText('Listo para ejecutar');
  await expect(page.getByLabel('Estado de la física')).toContainText('Pausada');
  await expect(robot()).toBeEnabled();
  await button('Cerrar sesión').click();
  await expect.poll(() => page.workers().length).toBe(0);
  // The same project manager remains usable at a phone viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await button('Proyectos').click();
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: resolve(root, `output/mujoco/projects-mobile-${browserName}.png`),
  });
  await page.keyboard.press('Escape');
  await expect(button('Proyectos')).toBeFocused();
  expect(errors).toEqual([]);
  const report = {
    executedAt: new Date().toISOString(),
    url: base,
    browserName,
    browser: await browser.version(),
    checks: [
      'main editor selects all three MuJoCo targets',
      'simple advance/wait and MicroDuck left-turn blocks achieve measured goals within 2.5 cm / 5 degrees',
      'Advanced retains timed velocity blocks',
      'observed movement versus goal shown and persisted',
      'real programs and measurements persisted',
      'reload retains completed result with zero workers',
      'edits invalidate result and cancel active run',
      'robot and backend slots preserve independent XML',
      'export/import preserves all destination programs and results',
      'project dialog creates, renames, duplicates, imports, exports and deletes after confirmation',
      'modal focus contained, Escape restores focus, responsive at 390px',
      'one MuJoCo simulator, joint probe under advanced options',
      'project switching restores selection',
      'reload of active run marks interrupted without auto-start',
      'default route has no engine asset requests',
    ],
    measurements: { jumper: completed.trace, microduck: duckTrace },
    errors,
  };
  await writeFile(
    resolve(
      root,
      `docs/evidence/mujoco-unified-workbench${browserName === 'chrome' ? '' : '-' + browserName}-validation.json`,
    ),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(report);
} catch (error) {
  console.error(browserName, 'failed', error);
  if (page && !page.isClosed())
    await page
      .screenshot({
        path: resolve(root, `output/mujoco/failure-${browserName}.png`),
      })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
