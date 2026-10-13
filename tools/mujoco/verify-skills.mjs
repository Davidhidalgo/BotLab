import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
    ignoreHTTPSErrors: true,
    acceptDownloads: true,
  });
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
    await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
  }
  await page.goto(process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4230');
  await page
    .getByRole('combobox', { name: /Idioma|Language/ })
    .selectOption('es');
  for (const robot of ['microduck']) {
    const doc = JSON.parse(
      await readFile(`examples/${robot}-mujoco-skills.botlab.json`, 'utf8'),
    );
    await importDocument(doc);
    await load(robot);
    await button('Ejecutar programa').click();
    await expect
      .poll(async () => (await saved()).mujocoExecution?.status, {
        timeout: 90000,
      })
      .toBe('completed');
    const run = (await saved()).mujocoExecution;
    const skills = run.trace
      .filter((t) => t.result.skill)
      .map((t) => t.result.skill);
    expect(skills.map((s) => s.name)).toEqual([
      'kick-left',
      'kick-right',
      'ground-pick',
    ]);
    expect(
      skills.every(
        (s) => s.durationSeconds < 10 && s.maxJointChangeRadians >= 0.15,
      ),
    ).toBe(true);
    const move = run.trace.find((t) => t.sourceBlockId === 'advance').result;
    expect(Math.abs(move.forwardDisplacementMeters - 0.15)).toBeLessThanOrEqual(
      0.025,
    );
    await page.reload();
    expect((await saved()).mujocoExecution.trace).toEqual(run.trace);
    await load(robot);
    await button('Ejecutar programa').click();
    await expect(outcome()).toHaveText('Ejecutando…');
    await button('Detener').click();
    await expect(outcome()).toHaveText('Cancelado');
    const cancelled = (await saved()).mujocoExecution;
    expect(cancelled.status).toBe('cancelled');
    await button('Cerrar sesión').click();
    const invalid = structuredClone(doc);
    invalid.workspace.content =
      '<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="start"><next><block type="botlab_microduck_sit" id="sit"><next><block type="botlab_microduck_kick_left" id="kick"/></next></block></next></block></xml>';
    await importDocument(invalid);
    await load(robot);
    await button('Ejecutar programa').click();
    await expect(outcome()).toHaveText('Ejecución fallida', {
      timeout: 90000,
    });
    const rejected = (await saved()).mujocoExecution;
    expect(rejected.trace.every((t) => !t.result.skill)).toBe(true);
    results.push({
      robot,
      run,
      cancellation: cancelled.status,
      seatedSkillRejected: rejected.status,
    });
    console.log(robot, 'skills passed');
  }
  expect(errors).toEqual([]);
  await writeFile(
    'docs/evidence/microduck-skills-workbench.json',
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
} finally {
  await browser.close();
}
