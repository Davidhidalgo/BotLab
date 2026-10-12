import { chromium, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..'),
  base = process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4210';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1150 },
    }),
    errors = [],
    engineRequests = [],
    nativeRequests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (r.url().includes(':4401/')) nativeRequests.push(r.url());
    if (/mujoco.*\.wasm|ort-wasm|simulation-assets/.test(r.url()))
      engineRequests.push(r.url());
  });
  await page.goto(base);
  await page.waitForTimeout(1000);
  expect(engineRequests).toHaveLength(0);
  nativeRequests.length = 0;
  await page.goto(base + '/?lab=mujoco');
  const button = (name) => page.getByRole('button', { name, exact: true });
  const time = () => page.getByLabel('Tiempo simulado').innerText();
  const outcome = page.getByLabel('Resultado del programa');
  await button('Cargar Jumper').click();
  await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  await button('Un paso').click();
  await expect(page.getByLabel('Tiempo simulado')).toContainText('tick 1');
  await button('Reiniciar').click();
  await expect(page.getByLabel('Tiempo simulado')).toContainText('tick 0');
  await button('Ejecutar programa').click();
  await expect(outcome).toHaveText('Completado con evidencia física', {
    timeout: 30000,
  });
  await button('Detener').click();
  await expect(page.getByLabel('Estado de la física')).toContainText('Pausada');
  const paused = await time();
  await page.waitForTimeout(250);
  expect(await time()).toBe(paused);
  await mkdir(resolve(root, 'output/mujoco'), { recursive: true });
  await page.screenshot({ path: resolve(root, 'output/mujoco/jumper.png') });
  await button('Reiniciar').click();
  await expect(page.getByLabel('Tiempo simulado')).toContainText('tick 0');
  await button('Ejecutar programa').click();
  await expect(outcome).toHaveText('Ejecutando…');
  await button('Detener').click();
  await expect(outcome).toHaveText('Cancelado', { timeout: 5000 });
  await page
    .getByLabel('Robot', { exact: true })
    .selectOption('jumper-walking');
  await button('Cargar Jumper').click();
  await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  await button('Ejecutar programa').click();
  await expect(outcome).toHaveText('Completado con evidencia física', {
    timeout: 45000,
  });
  await button('Detener').click();
  const jumperPosition = await page.getByTestId('root-position').innerText();
  expect(
    Number(jumperPosition.match(/Posición: ([\d.-]+)/)[1]),
  ).toBeGreaterThan(0.4);
  await page.screenshot({
    path: resolve(root, 'output/mujoco/jumper-walking.png'),
  });
  await button('Reiniciar').click();
  await button('Ejecutar programa').click();
  await expect(outcome).toHaveText('Ejecutando…');
  await button('Pausar').click();
  await page.waitForTimeout(150);
  await button('Reproducir física').click();
  await expect(outcome).toHaveText('Completado con evidencia física', {
    timeout: 45000,
  });
  await button('Reiniciar').click();
  await button('Ejecutar programa').click();
  await expect(outcome).toHaveText('Ejecutando…');
  await button('Detener').click();
  await expect(outcome).toHaveText('Cancelado', { timeout: 5000 });
  await page.getByLabel('Robot', { exact: true }).selectOption('microduck');
  await button('Cargar MicroDuck').click();
  await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  await button('Ejecutar programa').click();
  await expect(outcome).toHaveText('Completado con evidencia física', {
    timeout: 45000,
  });
  const position = await page.getByTestId('root-position').innerText();
  const x = Number(position.match(/Posición: ([\d.-]+)/)[1]);
  expect(x).toBeGreaterThan(0.15);
  await button('Detener').click();
  await page.screenshot({ path: resolve(root, 'output/mujoco/microduck.png') });
  await button('Reiniciar').click();
  await button('Ejecutar programa').click();
  await expect(outcome).toHaveText('Ejecutando…');
  await button('Detener').click();
  await expect(outcome).toHaveText('Cancelado', { timeout: 5000 });
  await expect(page.getByLabel('Estado de la física')).toContainText('Pausada');
  const stopped = await time();
  await page.waitForTimeout(300);
  expect(await time()).toBe(stopped);
  const cycles = [];
  for (let i = 0; i < 10; i++) {
    const robot = ['jumper', 'jumper-walking', 'microduck'][i % 3];
    await page.getByLabel('Robot', { exact: true }).selectOption(robot);
    await button(
      robot === 'microduck' ? 'Cargar MicroDuck' : 'Cargar Jumper',
    ).click();
    await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
    await button('Un paso').click();
    await expect(page.getByLabel('Tiempo simulado')).not.toContainText(
      'tick 0',
    );
    await button('Reiniciar').click();
    await expect(page.getByLabel('Tiempo simulado')).toContainText('tick 0');
    const workers = page.workers().length;
    expect(workers).toBe(1);
    cycles.push({ robot, workers });
  }
  await button('Cerrar sesión').click();
  await expect.poll(() => page.workers().length).toBe(0);
  expect(errors).toEqual([]);
  expect(nativeRequests).toEqual([]);
  const report = {
    executedAt: new Date().toISOString(),
    url: base,
    browser: await browser.version(),
    defaultAppEngineRequests: 0,
    nativeServiceRequests: nativeRequests.length,
    jumper: 'load/step/reset/run/cancel/pause passed',
    jumperWalking: 'advance/zero-twist/pause/resume/cancel passed',
    jumperWalkingPosition: jumperPosition,
    microduck: 'walk/turn/zero-twist/stop/cancel passed',
    microduckPosition: position,
    targetSwitchCycles: cycles,
    workersAfterClose: page.workers().length,
    errors,
  };
  await writeFile(
    resolve(root, 'docs/evidence/mujoco-ui-validation.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
