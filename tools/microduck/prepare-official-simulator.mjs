#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MESSAGE_TYPE = 'botlab.microduck.control-source.v1';
const DEFAULT_ORIGIN =
  'https://huggingface.co/spaces/pollen-robotics/microduck-simulator';
const DEFAULT_CHECKOUT = 'tmp/microduck-simulator';
const MODULE_PATH = 'app/src/game/controls/botlab.js';
const GAME_PATH = 'app/src/game/game.js';
const LFS_DISABLED_GIT_CONFIG = [
  '-c',
  'filter.lfs.required=false',
  '-c',
  'filter.lfs.smudge=',
  '-c',
  'filter.lfs.clean=',
  '-c',
  'filter.lfs.process=',
];

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const options = parseArgs(process.argv.slice(2));
const checkoutDir = resolve(rootDir, options.checkout ?? DEFAULT_CHECKOUT);
const appDir = resolve(checkoutDir, 'app');
const allowedOrigin = options.botlabOrigin ?? 'http://127.0.0.1:4200';
const host = options.host ?? '127.0.0.1';
const port = options.port ?? '4300';

ensureCheckout(checkoutDir, {
  origin: options.origin ?? DEFAULT_ORIGIN,
  revision: options.revision ?? 'main',
});

if (!options.noLfsHydrate) {
  await hydrateLfsPointers(checkoutDir, {
    origin: options.origin ?? DEFAULT_ORIGIN,
    revision: options.revision ?? 'main',
  });
}

writeGeneratedFile(
  resolve(checkoutDir, MODULE_PATH),
  createBotLabSourceModule({ allowedOrigins: [allowedOrigin] })
);

patchOfficialGame(resolve(checkoutDir, GAME_PATH));

if (!options.noInstall && !existsSync(resolve(appDir, 'node_modules'))) {
  run('npm', ['install'], { cwd: appDir });
}

console.log('');
console.log('BotLab-enabled MicroDuck simulator host is ready.');
console.log(`Checkout: ${checkoutDir}`);
console.log(`BotLab origin allowed by simulator source: ${allowedOrigin}`);
console.log(`Simulator URL after start: http://${host}:${port}/`);

if (options.start) {
  run('npm', ['run', 'dev', '--', '--host', host, '--port', String(port)], {
    cwd: appDir,
    stdio: 'inherit',
  });
} else {
  console.log('');
  console.log('Start it with:');
  console.log(
    `  npm run microduck:sim -- --checkout ${relativeFromRoot(
      checkoutDir
    )} --start --port ${port}`
  );
}

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--start') {
      parsed.start = true;
      continue;
    }

    if (arg === '--no-install') {
      parsed.noInstall = true;
      continue;
    }

    if (arg === '--no-lfs-hydrate') {
      parsed.noLfsHydrate = true;
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) =>
      char.toUpperCase()
    );
    const value = args[index + 1];

    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function ensureCheckout(checkoutDir, { origin, revision }) {
  if (!existsSync(checkoutDir)) {
    mkdirSync(dirname(checkoutDir), { recursive: true });
    run('git', [
      ...LFS_DISABLED_GIT_CONFIG,
      'clone',
      '--depth',
      '1',
      '--branch',
      revision,
      origin,
      checkoutDir,
    ]);
    return;
  }

  if (!existsSync(resolve(checkoutDir, '.git'))) {
    throw new Error(`${checkoutDir} exists but is not a git checkout.`);
  }

  const status = run('git', [...LFS_DISABLED_GIT_CONFIG, 'status', '--short'], {
    cwd: checkoutDir,
    stdio: 'pipe',
  }).stdout.trim();

  if (status.length > 0) {
    console.warn(
      'Existing simulator checkout has local changes; keeping current revision.'
    );
    return;
  }

  const remote = run('git', ['remote', 'get-url', 'origin'], {
    cwd: checkoutDir,
    stdio: 'pipe',
    allowFailure: true,
  });

  if (remote.status !== 0) {
    console.warn(
      'Existing simulator checkout has no origin remote; keeping current revision.'
    );
    return;
  }

  run(
    'git',
    [...LFS_DISABLED_GIT_CONFIG, 'fetch', '--depth', '1', 'origin', revision],
    {
      cwd: checkoutDir,
    }
  );
  run('git', [...LFS_DISABLED_GIT_CONFIG, 'checkout', 'FETCH_HEAD'], {
    cwd: checkoutDir,
  });
}

async function hydrateLfsPointers(checkoutDir, { origin, revision }) {
  const pointerFiles = findLfsPointerFiles(resolve(checkoutDir, 'app/public'));

  if (pointerFiles.length === 0) {
    return;
  }

  console.log(`Hydrating ${pointerFiles.length} Git LFS asset(s) from upstream.`);

  for (const path of pointerFiles) {
    const relativePath = relative(checkoutDir, path)
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    const url = createResolveUrl(origin, revision, relativePath);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Could not download ${relativePath}: ${response.status}`);
    }

    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
}

function findLfsPointerFiles(root) {
  if (!existsSync(root)) {
    return [];
  }

  const pending = [root];
  const pointers = [];

  while (pending.length > 0) {
    const current = pending.pop();

    if (!current) {
      continue;
    }

    for (const entry of readdirSync(current)) {
      const path = resolve(current, entry);
      const stats = statSync(path);

      if (stats.isDirectory()) {
        pending.push(path);
        continue;
      }

      if (isLfsPointerFile(path)) {
        pointers.push(path);
      }
    }
  }

  return pointers.sort();
}

function isLfsPointerFile(path) {
  const file = openSync(path, 'r');
  const buffer = Buffer.alloc(48);

  try {
    const bytesRead = readSync(file, buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead).toString('utf8');

    return header.startsWith('version https://git-lfs.github.com/spec/v1');
  } finally {
    closeSync(file);
  }
}

function createResolveUrl(origin, revision, relativePath) {
  const base = origin.replace(/\/+$/, '');

  if (!base.startsWith('https://huggingface.co/')) {
    throw new Error(
      'Automatic LFS hydration currently supports Hugging Face Space origins only.'
    );
  }

  return `${base}/resolve/${encodeURIComponent(revision)}/${relativePath}`;
}

function writeGeneratedFile(path, source) {
  mkdirSync(dirname(path), { recursive: true });

  if (existsSync(path) && readFileSync(path, 'utf8') === source) {
    return;
  }

  writeFileSync(path, source);
}

function patchOfficialGame(path) {
  const original = readFileSync(path, 'utf8');
  const result = patchGameSource(original);

  for (const warning of result.warnings) {
    console.warn(warning);
  }

  if (result.changed) {
    writeFileSync(path, result.source);
  }
}

function patchGameSource(source) {
  const importLine = 'import { BotLabSource } from "./controls/botlab.js";';
  const factoryLine =
    'const botLabSource = new BotLabSource({ getVelocityLimits: () => velLims(), isInputLocked: () => inputLocked });';
  const warnings = [];
  let patched = source.replace(
    'const botLabSource = new BotLabSource({ getVelocityLimits: () => velLims() });',
    factoryLine
  );

  if (!patched.includes(importLine)) {
    patched = insertAfterLastImport(patched, importLine);
  }

  if (!patched.includes(factoryLine)) {
    const next = insertBeforeControllerConstruction(patched, factoryLine);

    if (next === patched) {
      warnings.push(
        'Could not find the official simulator Controller construction. Add the BotLabSource factory manually near the controller setup.'
      );
    }

    patched = next;
  }

  if (!controllerSourcesInclude(patched, 'botLabSource')) {
    const next = insertControllerSource(patched, 'botLabSource');

    if (next === patched) {
      warnings.push(
        'Could not find a Controller sources array. Add botLabSource to the sources list manually.'
      );
    }

    patched = next;
  }

  return {
    source: patched,
    changed: patched !== source,
    warnings,
  };
}

function insertAfterLastImport(source, importLine) {
  const importMatches = [...source.matchAll(/^import\s.+;$/gm)];
  const lastImport = importMatches[importMatches.length - 1];

  if (!lastImport || lastImport.index === undefined) {
    return `${importLine}\n${source}`;
  }

  const insertAt = lastImport.index + lastImport[0].length;

  return `${source.slice(0, insertAt)}\n${importLine}${source.slice(insertAt)}`;
}

function insertBeforeControllerConstruction(source, sourceFactoryLine) {
  const controllerMatch = source.match(
    /^(\s*)(?:controller|const\s+controller|let\s+controller)\s*=\s*new Controller\(\{\s*sources:\s*\[/m
  );

  if (!controllerMatch || controllerMatch.index === undefined) {
    return source;
  }

  const indent = controllerMatch[1] ?? '';

  return `${source.slice(
    0,
    controllerMatch.index
  )}${indent}${sourceFactoryLine}\n${source.slice(controllerMatch.index)}`;
}

function controllerSourcesInclude(source, sourceName) {
  const sourcesArray = readControllerSourcesArray(source);

  return sourcesArray?.includes(sourceName) ?? false;
}

function insertControllerSource(source, sourceName) {
  const sourcesMatch = source.match(/sources:\s*\[/m);

  if (!sourcesMatch || sourcesMatch.index === undefined) {
    return source;
  }

  const insertAt = sourcesMatch.index + sourcesMatch[0].length;

  return `${source.slice(0, insertAt)}${sourceName}, ${source.slice(insertAt)}`;
}

function readControllerSourcesArray(source) {
  const sourcesMatch = source.match(/sources:\s*\[/m);

  if (!sourcesMatch || sourcesMatch.index === undefined) {
    return undefined;
  }

  const start = sourcesMatch.index + sourcesMatch[0].length;
  const end = source.indexOf(']', start);

  if (end === -1) {
    return undefined;
  }

  return source.slice(start, end);
}

function createBotLabSourceModule({ allowedOrigins }) {
  return `const MESSAGE_TYPE = ${JSON.stringify(MESSAGE_TYPE)};
const ALLOWED_ORIGINS = ${JSON.stringify(allowedOrigins)};
const ACTIVE_SOURCES = new Set();
let latestControlSource;
let latestExecution;
const receivedExecutions = new Set();
const executions = new Map();

function reportExecution(execution, status, frameIndex) {
  if (!execution) return;
  execution.status = status;
  execution.frameIndex = frameIndex;
  execution.reply?.postMessage({
    type: "botlab.microduck.execution.v1", version: 1,
    simulatorId: "microduck-official-sim",
    executionId: execution.id, artifactId: execution.artifactId,
    status, frameIndex,
  }, execution.origin);
}

function trustedSender(event) {
  return (!window.parent || event.source === window.parent) &&
    (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(event.origin));
}

window.addEventListener("message", (event) => {
  if (!trustedSender(event)) return;
  const message = event.data;
  if (message?.type === "botlab.microduck.stop.v1" && message.version === 1 &&
      message.simulatorId === "microduck-official-sim" &&
      typeof message.executionId === "string" && message.executionId.length > 0) {
    const execution = executions.get(message.executionId) ?? {
      id: message.executionId, artifactId: message.artifactId,
      reply: event.source, origin: event.origin,
    };
    executions.set(execution.id, execution);
    receivedExecutions.add("run:" + execution.id);
    if (latestExecution?.id === execution.id) {
      latestControlSource = undefined;
      latestExecution = undefined;
    }
    for (const source of ACTIVE_SOURCES) {
      if (source.execution?.id === execution.id) source.clear();
    }
    reportExecution(execution, execution.status === "completed" ? "completed" : "stopped");
    return;
  }
  const controlSource = parseControlSourceMessage(event);

  if (!controlSource) {
    return;
  }

  const key = event.data.executionId
    ? "run:" + event.data.executionId
    : "legacy:" + JSON.stringify(controlSource);
  if (receivedExecutions.has(key)) {
    const existing = executions.get(message.executionId);
    if (existing) reportExecution(existing, existing.status, existing.frameIndex);
    return;
  }
  receivedExecutions.add(key);
  latestControlSource = controlSource;
  latestExecution = message.executionId ? {
    id: message.executionId, artifactId: controlSource.artifactId,
    reply: event.source, origin: event.origin,
  } : undefined;
  if (latestExecution) {
    executions.set(latestExecution.id, latestExecution);
    reportExecution(latestExecution, "accepted");
  }

  for (const source of ACTIVE_SOURCES) {
    source.load(controlSource, latestExecution);
  }
});

export class BotLabSource {
  constructor({ getVelocityLimits, isInputLocked } = {}) {
    this.id = "botlab";
    this.connected = true;
    this.command = new Float32Array(3);
    this.axes = { jaw: 0, orbitX: 0, orbitY: 0, ride: 0 };
    this.pressed = {};
    this.onAction = () => {};
    this.getVelocityLimits = getVelocityLimits ?? (() => [2, -1, 3]);
    this.isInputLocked = isInputLocked ?? (() => false);
    this.frames = [];
    this.cursor = 0;
    this.frameElapsedMs = 0;
    this.active = false;
  }

  init() {
    this.connected = true;
    ACTIVE_SOURCES.add(this);

    if (latestControlSource) {
      this.load(latestControlSource, latestExecution);
    }
  }

  dispose() {
    ACTIVE_SOURCES.delete(this);
    this.connected = false;
    this.clear();
  }

  load(controlSource, execution) {
    if (this.execution) this.clear();
    this.execution = execution;
    this.reportedCursor = -1;
    this.heartbeatElapsed = 0;
    this.frames = [...controlSource.frames];
    this.cursor = 0;
    this.frameElapsedMs = 0;
    this.active = false;
    this.resetCommand();
    this.resetPressed();
  }

  clear(status = "stopped") {
    reportExecution(this.execution, status);
    this.execution = undefined;
    this.frames = [];
    this.cursor = 0;
    this.frameElapsedMs = 0;
    this.active = false;
    this.resetCommand();
    this.resetPressed();
    this.axes.jaw = 0;
    this.axes.orbitX = 0;
    this.axes.orbitY = 0;
    this.axes.ride = 0;
  }

  isActive() {
    return this.active;
  }

  poll(dt = 1 / 50) {
    try {
      this.pollFrame(dt);
    } catch {
      this.clear("failed");
    }
  }

  pollFrame(dt) {
    if (this.isInputLocked()) {
      this.active = false;
      this.resetCommand();
      return;
    }
    const frame = this.frames[this.cursor];

    if (!frame) {
      reportExecution(this.execution, "completed");
      this.execution = undefined;
      this.active = false;
      this.resetCommand();
      return;
    }

    this.heartbeatElapsed += dt;
    if (this.reportedCursor !== this.cursor || this.heartbeatElapsed >= 1) {
      reportExecution(this.execution, "running", this.cursor);
      this.reportedCursor = this.cursor;
      this.heartbeatElapsed = 0;
    }
    this.applyFrame(frame);
    const durationMs = getFrameDurationMs(frame);

    if (durationMs <= 0) {
      this.cursor += 1;
      this.frameElapsedMs = 0;
      return;
    }

    this.frameElapsedMs += dt * 1000;

    if (this.frameElapsedMs >= durationMs) {
      this.cursor += 1;
      this.frameElapsedMs = 0;
    }
  }

  applyFrame(frame) {
    this.resetCommand();
    this.resetPressed();

    if (frame.type === "differential-drive") {
      const [forwardLimit, backwardLimit, angularLimit] =
        this.getVelocityLimits();
      const forwardPower = clampUnit((frame.leftPower + frame.rightPower) / 2);
      const turnPower = clampUnit((frame.rightPower - frame.leftPower) / 2);

      this.command[0] =
        forwardPower >= 0
          ? forwardPower * forwardLimit
          : forwardPower * Math.abs(backwardLimit);
      this.command[1] = 0;
      this.command[2] = turnPower * angularLimit;
      this.pressed.forward = this.command[0] > 0;
      this.pressed.back = this.command[0] < 0;
      this.pressed.turnLeft = this.command[2] > 0;
      this.pressed.turnRight = this.command[2] < 0;
      this.active = this.command.some((value) => Math.abs(value) > 0);
      return;
    }

    if (frame.type === "led-pattern") {
      this.pressed[\`led:\${frame.pattern}\`] = true;
      this.axes.jaw =
        typeof frame.brightness === "number" && frame.brightness > 0
          ? Math.min(frame.brightness / 100, 1)
          : 0;
    }
  }

  resetCommand() {
    this.command[0] = 0;
    this.command[1] = 0;
    this.command[2] = 0;
  }

  resetPressed() {
    for (const key of Object.keys(this.pressed)) {
      delete this.pressed[key];
    }
  }
}

function clampUnit(value) {
  return Math.max(-1, Math.min(1, value));
}

function getFrameDurationMs(frame) {
  return frame.type === "differential-drive" &&
    typeof frame.durationMs === "number"
    ? Math.max(frame.durationMs, 0)
    : 0;
}

function parseControlSourceMessage(event) {
  if (
    ALLOWED_ORIGINS.length > 0 &&
    typeof event.origin === "string" &&
    !ALLOWED_ORIGINS.includes(event.origin)
  ) {
    return undefined;
  }

  const message = event.data;
  if (
    !message ||
    message.type !== MESSAGE_TYPE ||
    message.version !== 1 ||
    (message.executionId !== undefined &&
      (typeof message.executionId !== "string" || message.executionId.length === 0)) ||
    message.simulatorId !== "microduck-official-sim" ||
    !message.source ||
    !Array.isArray(message.source.frames)
  ) {
    return undefined;
  }

  return message.source;
}
`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    encoding: 'utf8',
    stdio: options.stdio ?? 'inherit',
  });

  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed.`);
  }

  return result;
}

function relativeFromRoot(path) {
  return path.startsWith(rootDir) ? path.slice(rootDir.length + 1) : path;
}
