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
  for (const robot of ['microduck', 'jumper']) {
    const doc = JSON.parse(
      await readFile(`examples/${robot}-mujoco-proximity.botlab.json`, 'utf8'),
    );
    doc.workspace.content = `<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="start"><next><block type="control_if_else" id="if"><value name="CONDITION"><block type="operator_and" id="and"><value name="OPERAND1"><block type="botlab_web_obstacle" id="far"><field name="CM">200</field></block></value><value name="OPERAND2"><block type="operator_not" id="not"><value name="OPERAND"><block type="botlab_web_obstacle" id="near"><field name="CM">30</field></block></value></block></value></block></value><statement name="SUBSTACK"><block type="control_wait" id="true-wait"><value name="DURATION"><shadow type="math_positive_number"><field name="NUM">0.5</field></shadow></value></block></statement><statement name="SUBSTACK2"><block type="botlab_web_advance_cm" id="wrong-branch"><field name="CM">15</field></block></statement></block></next></block></xml>`;
    await importDocument(doc);
    await load(robot);
    await button('Ejecutar programa').click();
    await expect
      .poll(async () => (await saved()).mujocoExecution?.status, {
        timeout: 30000,
      })
      .toBe('completed');
    const run = (await saved()).mujocoExecution;
    expect(run.trace[0].result.decision.value).toBe(true);
    expect(run.trace.some((t) => t.sourceBlockId === 'true-wait')).toBe(true);
    expect(run.trace.some((t) => t.sourceBlockId === 'wrong-branch')).toBe(
      false,
    );
    await expect(
      page.getByRole('list', { name: 'Comprobaciones de la condición' }),
    ).toContainText('∧');
    await page.reload();
    expect((await saved()).mujocoExecution.trace[0].result.decision).toEqual(
      run.trace[0].result.decision,
    );
    results.push({ robot, run });
    console.log(robot, 'logical conditions passed');
  }
  expect(errors).toEqual([]);
  await writeFile(
    'docs/evidence/mujoco-logical-conditions.json',
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
