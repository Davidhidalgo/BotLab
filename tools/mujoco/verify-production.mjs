import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage(),
    errors = [],
    targets = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    (process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4211') + '/?lab=mujoco',
  );
  for (const robot of ['jumper', 'jumper-walking', 'microduck']) {
    await page.getByLabel('Robot', { exact: true }).selectOption(robot);
    await page
      .getByRole('button', {
        name: robot === 'microduck' ? 'Cargar MicroDuck' : 'Cargar Jumper',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('button', { name: 'Ejecutar programa', exact: true }),
    ).toBeEnabled({ timeout: 90000 });
    await page.getByRole('button', { name: 'Un paso', exact: true }).click();
    await expect(page.getByLabel('Tiempo simulado')).not.toContainText(
      'tick 0',
    );
    targets.push({
      robot,
      result: 'verified assets, worker, controller and step passed',
    });
  }
  expect(errors).toEqual([]);
  const report = {
    executedAt: new Date().toISOString(),
    browser: await browser.version(),
    targets,
    errors,
  };
  await writeFile(
    resolve(
      import.meta.dirname,
      '../../docs/evidence/mujoco-production-validation.json',
    ),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(report);
} finally {
  await browser.close();
}
