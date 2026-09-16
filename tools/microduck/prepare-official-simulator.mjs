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

import { loadSimulatorBridge } from './load-simulator-bridge.mjs';

const {
  createMicroDuckBotLabPostMessageSourceModule: createBotLabSourceModule,
  patchMicroDuckOfficialSimulatorGameSource: patchGameSource,
  patchMicroDuckOfficialSimulatorArenaSource: patchBotLabArena,
  MICRODUCK_BOTLAB_SOURCE_MODULE_PATH: MODULE_PATH,
  MICRODUCK_SIMULATOR_GAME_SOURCE_PATH: GAME_PATH,
} = await loadSimulatorBridge();
const DEFAULT_ORIGIN =
  'https://huggingface.co/spaces/pollen-robotics/microduck-simulator';
const DEFAULT_CHECKOUT = 'tmp/microduck-simulator';
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
  createBotLabSourceModule({
    allowedOrigins: allowedOrigin.split(',').map((origin) => origin.trim()),
  }),
);

patchOfficialGame(resolve(checkoutDir, GAME_PATH));
const arenaPath = resolve(checkoutDir, 'app/src/game/constants.js');
writeGeneratedFile(
  arenaPath,
  patchBotLabArena(readFileSync(arenaPath, 'utf8')),
);

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
    `  pnpm run microduck:sim --checkout ${relativeFromRoot(
      checkoutDir,
    )} --start --port ${port}`,
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

    const key = arg
      .slice(2)
      .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
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
      'Existing simulator checkout has local changes; keeping current revision.',
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
      'Existing simulator checkout has no origin remote; keeping current revision.',
    );
    return;
  }

  run(
    'git',
    [...LFS_DISABLED_GIT_CONFIG, 'fetch', '--depth', '1', 'origin', revision],
    {
      cwd: checkoutDir,
    },
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

  console.log(
    `Hydrating ${pointerFiles.length} Git LFS asset(s) from upstream.`,
  );

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
      'Automatic LFS hydration currently supports Hugging Face Space origins only.',
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
