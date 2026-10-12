import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const base = process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4230';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const modern = JSON.parse(
  await readFile('examples/microduck-mujoco-first-steps.botlab.json', 'utf8'),
);
const originalXml =
  '<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="old-start"><next><block type="botlab_microduck_sit" id="old-sit"/></next></block></xml>';
const results = [];
try {
  for (const backend of ['browser', 'native']) {
    const page = await browser.newPage({ acceptDownloads: true });
    console.log('migration', backend, 'start');
    const errors = [],
      legacyRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (/:4300|:4401|\/simulator\//.test(request.url()))
        legacyRequests.push(request.url());
    });
    const document = {
      ...modern,
      targetId: 'microduck-sim',
      simulatorBackend: backend,
      workspace: { ...modern.workspace, content: originalXml },
      lastExecution: {
        executionId: 'old-run',
        status: 'completed',
        source: {
          artifactId: 'old-plan',
          targetId: 'microduck-sim',
          frames: [],
          messages: [],
          errors: [],
        },
        events: [{ status: 'completed', at: '2026-10-12T12:00:00Z' }],
      },
    };
    await page.addInitScript((doc) => {
      if (!sessionStorage.getItem('migration-seeded')) {
        localStorage.setItem('botlab.workspace.v1', JSON.stringify(doc));
        sessionStorage.setItem('migration-seeded', '1');
      }
    }, document);
    const saved = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('botlab.workspace.v1')),
      );
    await page.goto(base);
    await expect(
      page.getByRole('combobox', { name: 'Robot', exact: true }),
    ).toHaveValue('microduck');
    const selector = page.getByRole('combobox', {
      name: 'Simulador',
      exact: true,
    });
    await expect(selector).toHaveValue('mujoco');
    await expect(selector.locator('option')).toHaveCount(1);
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByText(/Se incluyen al exportar/)).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'contiene bloques' }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (await saved()).targetWorkspaces?.[`microduck-sim:${backend}`]
            ?.workspace.content,
      )
      .toBe(originalXml);
    expect(
      (await saved()).targetWorkspaces[`microduck-sim:${backend}`].lastExecution
        .executionId,
    ).toBe('old-run');
    expect((await saved()).mujocoExecution).toBeUndefined();
    expect(page.workers()).toHaveLength(0);
    console.log('migration', backend, 'archive checked');
    if (backend === 'browser') {
      await page
        .getByRole('button', { name: 'Cargar MicroDuck', exact: true })
        .click();
      await expect
        .poll(() => page.workers().length, { timeout: 90000 })
        .toBe(1);
      await expect(page.getByLabel('Estado de la física')).toContainText(
        'Preparada',
        { timeout: 90000 },
      );
      await expect(
        page.getByRole('button', { name: 'Ejecutar programa', exact: true }),
      ).toBeDisabled();
      await page
        .getByRole('combobox', { name: 'Robot', exact: true })
        .selectOption('jumper');
      await expect.poll(() => page.workers().length).toBe(0);
      await page
        .getByRole('combobox', { name: 'Robot', exact: true })
        .selectOption('microduck');
    }
    await page.getByRole('button', { name: 'Proyectos', exact: true }).click();
    const pending = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Exportar proyecto', exact: true })
      .click();
    const download = await pending;
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(
      exported.targetWorkspaces[`microduck-sim:${backend}`].workspace.content,
    ).toBe(originalXml);
    expect(
      exported.targetWorkspaces[`microduck-sim:${backend}`].lastExecution
        .executionId,
    ).toBe('old-run');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(selector).toHaveValue('mujoco');
    await expect(page.getByText(/Se incluyen al exportar/)).toBeVisible();
    expect(page.workers()).toHaveLength(0);
    // Importing another retired project with a previously edited MuJoCo slot must prefer that slot.
    await page.getByLabel('Importar proyecto', { exact: true }).setInputFiles({
      name: 'old-with-web.botlab.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          ...document,
          targetWorkspaces: {
            'microduck-mujoco-web': { workspace: modern.workspace },
          },
        }),
      ),
    });
    await expect
      .poll(async () => (await saved()).workspace.content.includes('old-sit'))
      .toBe(false);
    await expect(
      page.getByRole('alert').filter({ hasText: 'contiene bloques' }),
    ).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await saved()).targetWorkspaces?.[`microduck-sim:${backend}`]
            ?.workspace.content,
      )
      .toBe(originalXml);
    expect((await saved()).targetId).toBe('microduck-mujoco-web');
    expect(legacyRequests).toEqual([]);
    expect(errors).toEqual([]);
    results.push({
      backend,
      archivedSource: true,
      archivedExecution: true,
      export: true,
      reload: true,
      importPrefersExistingWeb: true,
      legacyRequests,
      errors,
    });
    await page.close();
  }
  const report = {
    date: new Date().toISOString(),
    url: base,
    browser: await browser.version(),
    results,
    passed: true,
  };
  await writeFile(
    'docs/evidence/mujoco-destination-migration.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(report);
} finally {
  await browser.close();
}
