import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const url = process.env.BOTLAB_TEST_URL ?? 'https://botlab.localhost';
const production = process.env.BOTLAB_PRODUCTION === '1';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = {
  executedAt: new Date().toISOString(),
  url,
  browser: browser.version(),
  production,
  errors: [],
  passed: false,
};
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
    acceptDownloads: true,
  });
  page.on('pageerror', (e) => report.errors.push(e.message));
  const button = (name) => page.getByRole('button', { name, exact: true });
  const saved = () =>
    page.evaluate(() => {
      const library = JSON.parse(localStorage.getItem('botlab.projects.v1'));
      return library.projects.find((p) => p.id === library.activeId).document;
    });
  await page.goto(url);
  await page
    .getByRole('combobox', { name: /Idioma|Language/ })
    .selectOption('es');
  await button('Proyectos').click();
  const chooser = page.waitForEvent('filechooser');
  await button('Importar proyecto').click();
  await (
    await chooser
  ).setFiles(resolve(root, 'examples/jumper-mujoco-turns.botlab.json'));
  await button('Cargar Jumper').click();
  await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  await expect(
    page.getByText(
      'Jumper puede avanzar, girar 90° a izquierda o derecha y esperar. El retroceso no está disponible.',
      { exact: true },
    ),
  ).toBeVisible();
  await button('Ejecutar programa').click();
  await expect(
    page.getByLabel('Resultado del programa', { exact: true }),
  ).toHaveText('Completado con evidencia física', { timeout: 120000 });
  await expect
    .poll(async () => (await saved()).mujocoExecution?.status)
    .toBe('completed');
  const document = await saved();
  const turns = document.mujocoExecution.trace.filter(
    (x) => x.result.targetYawRadians !== undefined,
  );
  expect(turns).toHaveLength(4);
  expect(turns.map((x) => Math.sign(x.result.targetYawRadians))).toEqual([
    1, -1, 1, -1,
  ]);
  for (const turn of turns)
    expect(
      Math.abs(turn.result.yawRadians - turn.result.targetYawRadians),
    ).toBeLessThanOrEqual((5 * Math.PI) / 180);
  expect(new Set(turns.map((x) => x.commandId)).size).toBe(4);
  expect(turns.map((x) => x.iterations[0].iteration)).toEqual([1, 1, 2, 2]);
  report.execution = document.mujocoExecution;
  await button('Detener').click();
  await mkdir(resolve(root, 'output/mujoco'), { recursive: true });
  await page.screenshot({
    path: resolve(root, 'output/mujoco/jumper-turns-completed.png'),
  });
  await button('Proyectos').click();
  const download = page.waitForEvent('download');
  await button('Exportar proyecto').click();
  const exported = JSON.parse(
    await readFile(await (await download).path(), 'utf8'),
  );
  expect(exported.mujocoExecution.trace).toEqual(
    document.mujocoExecution.trace,
  );
  await page.reload();
  expect((await saved()).mujocoExecution.trace).toEqual(
    document.mujocoExecution.trace,
  );
  await expect.poll(() => page.workers().length).toBe(0);
  await button('Cargar Jumper').click();
  await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  await button('Ejecutar programa').click();
  await expect(
    page.getByLabel('Progreso del programa', { exact: true }),
  ).toHaveAttribute('data-block-id', 'left', { timeout: 45000 });
  await button('Detener').click();
  await expect(
    page.getByLabel('Resultado del programa', { exact: true }),
  ).toHaveText('Cancelado', { timeout: 5000 });
  const stopped = await page.getByLabel('Tiempo simulado').textContent();
  await page.waitForTimeout(500);
  expect(await page.getByLabel('Tiempo simulado').textContent()).toBe(stopped);
  report.cancelledDuring = 'left turn after forward';
  report.pausedTime = stopped;
  await button('Cerrar sesión').click();
  await expect.poll(() => page.workers().length).toBe(0);
  expect(report.errors).toEqual([]);
  report.workersAfterClose = 0;
  report.passed = true;
} finally {
  await writeFile(
    resolve(
      root,
      `docs/evidence/jumper-turns-${production ? 'production' : 'ui'}-validation.json`,
    ),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
}
