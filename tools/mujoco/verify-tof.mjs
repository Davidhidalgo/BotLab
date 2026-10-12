import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
    ignoreHTTPSErrors: true,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const button = (name) => page.getByRole('button', { name, exact: true });
  const scene = () =>
    page.getByRole('combobox', { name: 'Escena', exact: true });
  const saved = () =>
    page.evaluate(() => {
      const l = JSON.parse(localStorage.getItem('botlab.projects.v1'));
      return l.projects.find((p) => p.id === l.activeId).document;
    });
  const depths = () =>
    page
      .locator('[data-depth]')
      .evaluateAll((cells) =>
        cells.map((c) =>
          c.dataset.depth === '' ? null : Number(c.dataset.depth),
        ),
      );
  await page.goto(process.env.BOTLAB_TEST_URL ?? 'https://botlab.localhost');
  await page
    .getByRole('combobox', { name: /Idioma|Language/ })
    .selectOption('es');
  await page
    .getByRole('combobox', { name: 'Robot', exact: true })
    .selectOption('microduck');
  await scene().selectOption('obstacles');
  await expect
    .poll(async () => (await saved()).simulationScene)
    .toBe('obstacles');
  await button('Cargar MicroDuck').click();
  await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  await expect(scene()).toBeDisabled();
  await expect(page.locator('[data-depth]')).toHaveCount(64);
  const initial = await depths();
  await mkdir('output/mujoco', { recursive: true });
  await page
    .getByTestId('tof-panel')
    .screenshot({ path: 'output/mujoco/tof-panel.png' });
  expect(initial.filter((v) => v !== null).length).toBeGreaterThan(20);
  await button('Reproducir física').click();
  await expect
    .poll(async () => Number(await page.getByTestId('tof-time').textContent()))
    .toBeGreaterThan(0.2);
  await button('Pausar').click();
  await expect(
    page.getByLabel('Estado de la física', { exact: true }),
  ).toContainText('Pausada');
  const pausedTime = await page.getByTestId('tof-time').textContent();
  await page.waitForTimeout(250);
  expect(await page.getByTestId('tof-time').textContent()).toBe(pausedTime);
  await button('Reiniciar').click();
  await expect(page.getByTestId('tof-time')).toHaveText('0.000');
  expect(await depths()).toEqual(initial);
  await button('Ejecutar programa').click();
  await expect(
    page.getByLabel('Resultado del programa', { exact: true }),
  ).toHaveText('Completado con evidencia física', { timeout: 90000 });
  const after = await depths();
  const report = (await saved()).mujocoExecution;
  expect(report.manifestId).toBe('microduck-obstacles-tof');
  expect(after).not.toEqual(initial);
  await button('Ejecutar programa').click();
  await expect(
    page.getByLabel('Resultado del programa', { exact: true }),
  ).toHaveText('Ejecutando…');
  await button('Detener').click();
  await expect(
    page.getByLabel('Resultado del programa', { exact: true }),
  ).toHaveText('Cancelado');
  const stoppedTime = await page.getByTestId('tof-time').textContent();
  await page.waitForTimeout(200);
  expect(await page.getByTestId('tof-time').textContent()).toBe(stoppedTime);

  await button('Cerrar sesión').click();
  await expect(page.getByTestId('tof-panel')).toHaveCount(0);
  await page.reload();
  await expect(scene()).toHaveValue('obstacles');
  await expect(page.getByTestId('tof-panel')).toHaveCount(0);
  await page
    .getByRole('combobox', { name: 'Robot', exact: true })
    .selectOption('jumper');
  await page
    .getByRole('combobox', { name: 'Robot', exact: true })
    .selectOption('microduck');
  await expect(scene()).toHaveValue('obstacles');
  await scene().selectOption('flat');
  await expect
    .poll(async () => (await saved()).mujocoExecution)
    .toBeUndefined();
  await button('Cargar MicroDuck').click();
  await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  await expect(page.getByTestId('tof-panel')).toHaveCount(0);
  await button('Cerrar sesión').click();
  expect(errors).toEqual([]);
  const evidence = {
    date: new Date().toISOString(),
    browser: await browser.version(),
    initial,
    after,
    report,
    pausedTime,
    checks: [
      '64 readings',
      'simulation pause freezes sensor',
      'reset restores initial readings',
      'walking completes with obstacle manifest',
      'cancel freezes sensor',
      'close removes readings',
      'reload preserves scene without autoload',
      'robot switch preserves scene',
      'scene change clears stale result',
      'flat scene remains without ToF',
    ],
    errors,
  };
  await writeFile(
    'docs/evidence/mujoco-tof-web.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({ checks: evidence.checks, initial, after }, null, 2),
  );
} finally {
  await browser.close();
}
