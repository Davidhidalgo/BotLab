import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
const b = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await b.newPage({ viewport: { width: 1600, height: 1150 } });
  await p.goto(
    (process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4210') + '/?lab=mujoco',
  );
  const button = (n) => p.getByRole('button', { name: n, exact: true });
  const outcome = p.getByLabel('Resultado del programa');
  await p.getByLabel('Robot', { exact: true }).selectOption('jumper-walking');
  await button('Cargar Jumper').click();
  await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  await button('Ejecutar programa').click();
  await expect(outcome).toHaveText('Completado con evidencia física', {
    timeout: 30000,
  });
  await button('Detener').click();
  async function edit(from, to) {
    await p
      .locator(
        '.blocklySvg > .blocklyWorkspace > .blocklyBlockCanvas .blocklyEditableField',
      )
      .filter({ hasText: from })
      .last()
      .dblclick();
    const input = p.locator('.blocklyHtmlInput');
    await expect(input).toBeVisible();
    await input.fill(to);
    await input.press('Enter');
  }
  await edit('1', '2');
  await expect(outcome).toHaveText('Listo para ejecutar');
  await button('Ejecutar programa').click();
  await expect(outcome).toHaveText('Ejecutando…');
  await edit('2', '3');
  await expect(outcome).toHaveText('Listo para ejecutar', { timeout: 5000 });
  await expect(p.getByLabel('Estado de la física')).toContainText('Pausada');
  await expect(button('Ejecutar programa')).toBeEnabled();
  await button('Ejecutar programa').click();
  await expect(outcome).toHaveText('Completado con evidencia física', {
    timeout: 30000,
  });
  const report = {
    executedAt: new Date().toISOString(),
    browser: await b.version(),
    afterCompletion: 'editing invalidates previous result',
    duringExecution: 'editing cancels and awaits stop before re-enabling Run',
    rerun: 'edited program completed',
  };
  await writeFile(
    resolve(
      import.meta.dirname,
      '../../docs/evidence/mujoco-editing-validation.json',
    ),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(report);
} finally {
  await b.close();
}
