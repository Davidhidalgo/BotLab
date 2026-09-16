import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.BOTLAB_PLAYWRIGHT_MODULE || 'playwright',
);
const output = 'tmp/native-video-qa';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const telemetry = [];
const frames = [];
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 25000);
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', async (response) => {
  if (response.url().endsWith('/state') && response.ok()) {
    try {
      const state = await response.json();
      telemetry.push({
        hz: state.state?.loop.hz,
        bytes: JSON.stringify(state).length,
      });
    } catch {
      /* Closing page. */
    }
  }
});
try {
  await page.goto(process.env.BOTLAB_QA_URL || 'http://127.0.0.1:4200/');
  await page
    .getByRole('combobox', { name: 'Simulador', exact: true })
    .selectOption('native');
  await page.getByRole('button', { name: 'Connectar', exact: true }).click();
  const img = page.getByRole('img', { name: 'Escena nativa de MuJoCo' });
  await img.waitFor({ timeout: 15000 });
  await page.waitForFunction(
    () =>
      document.querySelector('img[alt="Escena nativa de MuJoCo"]')
        ?.naturalWidth > 0,
  );
  const url = await img.getAttribute('src');
  const response = await fetch(url, { signal: controller.signal });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const reading = (async () => {
    let buffer = Buffer.alloc(0);
    try {
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer = Buffer.concat([buffer, Buffer.from(value)]);
        while (true) {
          const boundary = buffer.indexOf('\r\n\r\n');
          if (boundary < 0) break;
          const header = buffer.subarray(0, boundary).toString();
          const size = Number(header.match(/Content-Length: (\d+)/)?.[1]);
          assert.ok(size > 0 && size < 1000000);
          if (buffer.length < boundary + 4 + size + 2) break;
          frames.push({ at: performance.now(), bytes: size });
          buffer = buffer.subarray(boundary + 4 + size + 2);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }
  })();
  const paint = await page.evaluate(async () => {
    const image = document.querySelector('img[alt="Escena nativa de MuJoCo"]');
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const started = performance.now();
    let changes = 0;
    let previous;
    let callbacks = 0;
    return new Promise((resolve) => {
      function sample(at) {
        context.drawImage(image, 0, 0, 640, 480);
        const pixels = context.getImageData(0, 0, 640, 480).data;
        let hash = 2166136261;
        for (let i = 0; i < pixels.length; i += 4)
          hash = Math.imul(hash ^ pixels[i], 16777619);
        if (previous !== undefined && hash !== previous) changes++;
        previous = hash;
        callbacks++;
        if (at - started >= 10000)
          resolve({
            changedImagesPerSecond: (changes * 1000) / (at - started),
            animationCallbacksPerSecond: (callbacks * 1000) / (at - started),
          });
        else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  });
  controller.abort();
  await reading;
  const warm = frames.slice(30);
  const intervals = warm
    .slice(1)
    .map((frame, i) => frame.at - warm[i].at)
    .sort((a, b) => a - b);
  const rates = telemetry.map((s) => s.hz).filter(Boolean);
  const result = {
    ...paint,
    receivedFps: ((warm.length - 1) * 1000) / (warm.at(-1).at - warm[0].at),
    intervalP95Ms: intervals[Math.floor(intervals.length * 0.95)],
    meanFrameBytes: frames.reduce((sum, f) => sum + f.bytes, 0) / frames.length,
    meanControlHz: rates.reduce((a, b) => a + b, 0) / rates.length,
    telemetryBytes: telemetry.at(-1).bytes,
    errors,
  };
  writeFileSync(`${output}/performance.json`, JSON.stringify(result, null, 2));
  await page.screenshot({ path: `${output}/native-video.png` });
  console.log(JSON.stringify(result, null, 2));
  assert.ok(
    result.receivedFps >= 27,
    'video should sustain at least 27 received fps',
  );
  assert.ok(
    result.changedImagesPerSecond >= 24,
    'browser should paint at least 24 distinct images per second',
  );
  assert.ok(result.meanControlHz >= 45, 'native policy rate must be preserved');
  assert.deepEqual(errors, []);
  await page.getByRole('button', { name: 'Desconnectar', exact: true }).click();
} finally {
  clearTimeout(timeout);
  controller.abort();
  await browser.close();
}
