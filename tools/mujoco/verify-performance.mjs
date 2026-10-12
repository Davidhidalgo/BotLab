import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, release, arch, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { motionScenarios } from './motion-scenarios.mjs';

const root = resolve(import.meta.dirname, '../..');
const base = process.env.BOTLAB_TEST_URL ?? 'http://127.0.0.1:4211';
const output = resolve(root, 'output/mujoco');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const browserCdp = await browser.newBrowserCDPSession();
const report = {
  executedAt: new Date().toISOString(),
  url: base,
  browser: await browser.version(),
  host: {
    platform: platform(),
    release: release(),
    arch: arch(),
    cpu: cpus()[0].model,
    cores: cpus().length,
    ramBytes: totalmem(),
  },
  method: {
    rendering:
      'WebGL draw submissions on distinct animation frames; headless Chrome, not physical display presentation',
    physics: 'Real worker frame messages during full editor program execution',
    load: 'Click Load until Run enabled; cold = fresh context and cleared HTTP cache; warm = same-page reload after disposal',
    memory:
      'Main-renderer JS heap after CDP garbage collection, and summed RSS of this isolated browser processes (shared pages may be counted twice; includes workers/GPU; not private allocated bytes)',
    recording: 'Video recording enabled throughout, 960x640',
  },
  thresholds: {
    renderFps: 30,
    realTimeFactor: 0.95,
    maxRealTimeFactor: 1.05,
    retainedHeapGrowthMiB: 16,
  },
  robots: {},
  lifecycle: [],
  errors: [],
};
function instrument() {
  const probe = (window.__motionProbe = {
    frames: [],
    draws: [],
    active: false,
    workers: 0,
    lastFrame: null,
    lastDrawStamp: -1,
    gpu: null,
  });
  const OriginalWorker = window.Worker;
  window.Worker = class extends OriginalWorker {
    constructor(...args) {
      super(...args);
      probe.workers++;
      let alive = true;
      const terminate = this.terminate.bind(this);
      this.terminate = () => {
        if (alive) {
          probe.workers--;
          alive = false;
        }
        return terminate();
      };
      this.addEventListener('message', ({ data }) => {
        if (!data?.frame) return;
        const f = data.frame;
        const sample = {
          wallMs: performance.now(),
          timeSeconds: f.timeSeconds,
          position: f.rootPosition,
          quaternion: f.rootQuaternion,
          state: f.state,
        };
        probe.lastFrame = sample;
        if (probe.active) probe.frames.push(sample);
      });
    }
  };
  const raf = window.requestAnimationFrame.bind(window);
  let stamp = -1;
  window.requestAnimationFrame = (callback) =>
    raf((time) => {
      stamp = time;
      callback(time);
    });
  for (const prototype of [
    WebGLRenderingContext.prototype,
    WebGL2RenderingContext.prototype,
  ]) {
    for (const method of [
      'drawArrays',
      'drawElements',
      'drawArraysInstanced',
      'drawElementsInstanced',
    ]) {
      const original = prototype[method];
      if (!original) continue;
      prototype[method] = function (...args) {
        if (
          this.canvas.getAttribute('aria-label') ===
          'Simulación física del robot'
        ) {
          if (!probe.gpu) {
            const debug = this.getExtension('WEBGL_debug_renderer_info');
            probe.gpu = debug
              ? this.getParameter(debug.UNMASKED_RENDERER_WEBGL)
              : this.getParameter(this.RENDERER);
          }
          if (probe.active && stamp !== probe.lastDrawStamp) {
            probe.draws.push(performance.now());
            probe.lastDrawStamp = stamp;
          }
        }
        return original.apply(this, args);
      };
    }
  }
}
const quantile = (values, p) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * p))
  ] ?? 0;
async function memory(page, cdp, label) {
  await cdp.send('HeapProfiler.collectGarbage');
  const metrics = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map(
      ({ name, value }) => [name, value],
    ),
  );
  const { processInfo } = await browserCdp.send('SystemInfo.getProcessInfo');
  const ids = processInfo
    .map((p) => p.id)
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  // Restrict process inspection to the isolated test browser's CDP-reported PIDs.
  const rows = execFileSync('ps', ['-o', 'pid=,rss=', '-p', ids.join(',')], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  const rssKiB = rows.reduce(
    (sum, row) => sum + Number(row.trim().split(/\s+/)[1]),
    0,
  );
  return {
    label,
    wallTime: new Date().toISOString(),
    heapMiB: metrics.JSHeapUsedSize / 1048576,
    rssMiB: rssKiB / 1024,
    nodes: metrics.Nodes,
    documents: metrics.Documents,
    workers: await page.evaluate(() => window.__motionProbe.workers),
    processCount: rows.length,
  };
}
let context;
try {
  for (const [robot, scenario] of Object.entries(motionScenarios)) {
    const seconds = scenario.steps.reduce(
      (sum, s) => sum + s.durationSeconds,
      0,
    );
    context = await browser.newContext({
      viewport: { width: 1600, height: 1000 },
      recordVideo: { dir: output, size: { width: 960, height: 640 } },
    });
    await context.addInitScript(instrument);
    const recordingStart = performance.now();
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (error) =>
      report.errors.push({ robot, message: error.message }),
    );
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Network.clearBrowserCache');
    await page.goto(base);
    report.buildScripts = await page
      .locator('script[src]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('src')),
      );
    await page
      .getByRole('combobox', { name: /Idioma|Language/ })
      .selectOption('es');
    const button = (name) => page.getByRole('button', { name, exact: true });
    const outcome = page.getByLabel('Resultado del programa', { exact: true });
    await button('Proyectos').click();
    const chooseFile = page.waitForEvent('filechooser');
    await button('Importar proyecto').click();
    await (
      await chooseFile
    ).setFiles(resolve(root, `examples/${robot}-mujoco-motion.botlab.json`));
    await expect(
      page.getByRole('combobox', { name: 'Robot', exact: true }),
    ).toHaveValue(robot);
    const load = async () => {
      const start = performance.now();
      await button(
        robot === 'jumper' ? 'Cargar Jumper' : 'Cargar MicroDuck',
      ).click();
      await expect(button('Ejecutar programa')).toBeEnabled({ timeout: 90000 });
      await expect
        .poll(() => page.evaluate(() => window.__motionProbe.workers))
        .toBe(1);
      return performance.now() - start;
    };
    const close = async () => {
      await button('Cerrar sesión').click();
      await expect
        .poll(() => page.evaluate(() => window.__motionProbe.workers))
        .toBe(0);
      await expect.poll(() => page.workers().length).toBe(0);
    };
    const result = (report.robots[robot] = {
      expectedSeconds: seconds,
      commandCount: scenario.steps.length,
      memory: [],
      warmLoadMs: [],
    });
    result.memory.push(await memory(page, cdp, 'before engine load'));
    result.coldLoadMs = await load();
    console.log(robot, 'cold load ms', Math.round(result.coldLoadMs));
    await close();
    for (let i = 0; i < 3; i++) {
      result.warmLoadMs.push(await load());
      await close();
    }
    result.memory.push(await memory(page, cdp, 'after 4 load/dispose cycles'));
    await load();
    result.memory.push(await memory(page, cdp, 'loaded before motion'));
    await page.evaluate(() => {
      const p = window.__motionProbe;
      p.frames = [];
      p.draws = [];
      p.active = true;
    });
    const start = performance.now();
    result.recordingMotionStartSeconds = (start - recordingStart) / 1000;
    await button('Ejecutar programa').click();
    await expect(outcome).toHaveText('Ejecutando…');
    let milestone = 0;
    while (performance.now() - start < seconds * 1800 + 30000) {
      await page.waitForTimeout(1000);
      const state = await outcome.textContent();
      const elapsed = (performance.now() - start) / 1000;
      if (elapsed >= (milestone + 1) * 30) {
        milestone++;
        const last = await page.evaluate(() => window.__motionProbe.lastFrame);
        result.memory.push(
          await memory(page, cdp, `motion ${Math.round(elapsed)} wall seconds`),
        );
        console.log(
          robot,
          Math.round(elapsed),
          'wall seconds;',
          last?.timeSeconds.toFixed(1),
          'simulated seconds',
        );
        if (milestone === 2)
          await page.screenshot({
            path: resolve(output, `${robot}-motion.png`),
          });
      }
      if (state !== 'Ejecutando…') break;
    }
    result.wallSeconds = (performance.now() - start) / 1000;
    result.outcome = await outcome.textContent();
    await page.screenshot({
      path: resolve(output, `${robot}-motion-finished.png`),
    });
    const probe = await page.evaluate(() => {
      window.__motionProbe.active = false;
      return window.__motionProbe;
    });
    result.gpu = probe.gpu;
    const frames = probe.frames.filter(
      (f, i, a) => i === 0 || f.timeSeconds > a[i - 1].timeSeconds,
    );
    const first = frames[0],
      last = frames.at(-1);
    result.simulatedSeconds = last.timeSeconds;
    result.realTimeFactor =
      (last.timeSeconds - first.timeSeconds) /
      ((last.wallMs - first.wallMs) / 1000);
    result.renderFps =
      (probe.draws.length - 1) / ((probe.draws.at(-1) - probe.draws[0]) / 1000);
    result.physicsFramesPerSecond =
      (frames.length - 1) / ((last.wallMs - first.wallMs) / 1000);
    result.renderIntervalP95Ms = quantile(
      probe.draws.slice(1).map((v, i) => v - probe.draws[i]),
      0.95,
    );
    result.minHeight = Math.min(...frames.map((f) => f.position[2]));
    result.maxTiltRadians = Math.max(
      ...frames.map((f) =>
        Math.acos(
          Math.max(
            -1,
            Math.min(1, 1 - 2 * (f.quaternion[1] ** 2 + f.quaternion[2] ** 2)),
          ),
        ),
      ),
    );
    result.pathMeters = frames
      .slice(1)
      .reduce(
        (sum, f, i) =>
          sum +
          Math.hypot(
            f.position[0] - frames[i].position[0],
            f.position[1] - frames[i].position[1],
          ),
        0,
      );
    result.trajectory = frames.filter(
      (_, i) => i % 30 === 0 || i === frames.length - 1,
    );
    result.savedExecution = await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('botlab.projects.v1'));
      return p.projects.find((v) => v.id === p.activeId).document
        .mujocoExecution;
    });
    result.passed =
      result.outcome === 'Completado con evidencia física' &&
      result.savedExecution?.trace.length === scenario.steps.length &&
      result.pathMeters >= scenario.minPathMeters &&
      result.renderFps >= report.thresholds.renderFps &&
      result.realTimeFactor >= report.thresholds.realTimeFactor &&
      result.realTimeFactor <= report.thresholds.maxRealTimeFactor;
    console.log(
      robot,
      JSON.stringify({
        passed: result.passed,
        renderFps: result.renderFps,
        realTimeFactor: result.realTimeFactor,
        pathMeters: result.pathMeters,
      }),
    );
    await button('Detener').click();
    await close();
    for (let i = 0; i < 5; i++) {
      const loadMs = await load();
      await close();
      const sample = await memory(
        page,
        cdp,
        `${robot} post-run disposal ${i + 1}`,
      );
      report.lifecycle.push({ robot, cycle: i + 1, loadMs, ...sample });
    }
    const cycleSamples = report.lifecycle.filter((s) => s.robot === robot);
    result.retainedHeapGrowthMiB =
      cycleSamples.at(-1).heapMiB - cycleSamples[0].heapMiB;
    result.passed &&=
      result.retainedHeapGrowthMiB <= report.thresholds.retainedHeapGrowthMiB;
    await writeFile(
      resolve(root, 'docs/evidence/mujoco-performance-validation.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    await context.close();
    await page.video().saveAs(resolve(output, `${robot}-motion.webm`));
    await page.video().delete();
    context = undefined;
  }
  report.passed =
    report.errors.length === 0 &&
    Object.values(report.robots).every((r) => r.passed) &&
    report.lifecycle.length === 10 &&
    report.lifecycle.every((s) => s.workers === 0);
  if (!report.passed) process.exitCode = 1;
} catch (error) {
  report.errors.push(String(error));
  report.passed = false;
  process.exitCode = 1;
  console.error(error);
} finally {
  await context?.close();
  await writeFile(
    resolve(root, 'docs/evidence/mujoco-performance-validation.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
}
