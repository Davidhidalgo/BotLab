import type { CompiledBehaviorArtifact, Target } from '@botlab/model';
import {
  createMicroDuckBrowserAssetCacheStore,
  createMicroDuckFetchAssetDownloader,
  createMicroDuckSimulatorAssetCachePlan,
  inspectMicroDuckSimulatorAssetCache,
  microDuckSimulatorAssetManifest,
  sha256MicroDuckSimulatorAssetBytes,
  setupMicroDuckSimulatorAssetCache,
  type MicroDuckSimulatorAssetCacheStore,
  validateMicroDuckSimulatorAssetManifest,
  type MicroDuckSimulatorAssetManifest,
  type MicroDuckSimulatorAssetManifestEntry,
} from './microduck-simulator-assets';
import {
  connectMicroDuckBotLabSourceToOfficialSimulator,
  createMicroDuckBotLabPostMessageSource,
  createMicroDuckBotLabPostMessageSourceModule,
  createMicroDuckOfficialSimulatorPatchInstructions,
  createMicroDuckBotLabOfficialSource,
  createMicroDuckSimulatorControlMessage,
  createMicroDuckSimulatorBridge,
  createMicroDuckSimulatorControlSource,
  loadMicroDuckOfficialSimulatorHost,
  parseMicroDuckSimulatorControlMessage,
  patchMicroDuckOfficialSimulatorGameSource,
  postMicroDuckSimulatorControlSource,
  type MicroDuckOfficialSimulatorSource,
} from './microduck-simulator';

describe('microDuckSimulatorBridge', () => {
  it('boots a MicroDuck simulator target and simulates a compiled behavior', async () => {
    const bridge = createMicroDuckSimulatorBridge({
      now: () => '2026-09-11T00:00:00.000Z',
    });
    const target = createMicroDuckSimulatorTarget();
    const bootSnapshot = await bridge.boot(target);

    expect(bootSnapshot).toMatchObject({
      simulatorId: 'microduck-official-sim',
      targetId: 'microduck-sim',
      state: 'ready',
      commandCount: 0,
    });

    const result = await bridge.simulate(createCompiledBehaviorArtifact());

    expect(result).toMatchObject({
      simulatorId: 'microduck-official-sim',
      artifactId: 'artifact-microduck-led-demo-microduck-sim-smile-plan',
      status: 'passed',
      commandCount: 1,
    });
    expect(result.snapshot.messages).toEqual([
      'MicroDuck simulator checked 1 command(s) at 2026-09-11T00:00:00.000Z.',
      'led-pattern -> {"pattern":"smile","brightness":50}',
    ]);
  });

  it('rejects plans before the simulator target is booted', async () => {
    const bridge = createMicroDuckSimulatorBridge();

    expect(() => bridge.simulate(createCompiledBehaviorArtifact())).toThrow(
      'Boot the MicroDuck simulator target before simulating.',
    );
  });

  it('maps compiled MicroDuck commands into simulator control frames', () => {
    expect(
      createMicroDuckSimulatorControlSource({
        ...createCompiledBehaviorArtifact(),
        commands: [
          createCompiledBehaviorArtifact().commands[0],
          {
            id: 'cmd-microduck-drive',
            capabilityId: 'microduck-motion',
            commandId: 'drive-differential',
            targetId: 'microduck-sim',
            inputs: {
              leftPower: 0.25,
              rightPower: -0.25,
              durationMs: 1500,
              distanceMeters: 3,
            },
          },
        ],
      }),
    ).toMatchObject({
      artifactId: 'artifact-microduck-led-demo-microduck-sim-smile-plan',
      targetId: 'microduck-sim',
      errors: [],
      frames: [
        {
          id: 'cmd-microduck-leds',
          type: 'led-pattern',
          targetId: 'microduck-sim',
          pattern: 'smile',
          brightness: 50,
        },
        {
          id: 'cmd-microduck-drive',
          type: 'differential-drive',
          targetId: 'microduck-sim',
          leftPower: 0.25,
          rightPower: -0.25,
          durationMs: 1500,
          distanceMeters: 3,
        },
      ],
    });
  });

  it('rejects unsupported simulator commands before reporting success', async () => {
    const bridge = createMicroDuckSimulatorBridge();
    await bridge.boot(createMicroDuckSimulatorTarget());

    expect(() =>
      bridge.simulate({
        ...createCompiledBehaviorArtifact(),
        commands: [
          {
            ...createCompiledBehaviorArtifact().commands[0],
            commandId: 'unknown-command',
          },
        ],
      }),
    ).toThrow(
      'Unsupported MicroDuck simulator command unknown-command for capability microduck-leds.',
    );
  });

  it('adapts BotLab control frames to the official simulator source contract', () => {
    const source = createMicroDuckBotLabOfficialSource({
      getVelocityLimits: () => [2, -1, 3],
    });
    const commandRef = source.command;
    const axesRef = source.axes;
    source.load(
      createMicroDuckSimulatorControlSource({
        ...createCompiledBehaviorArtifact(),
        commands: [
          {
            id: 'cmd-microduck-drive',
            capabilityId: 'microduck-motion',
            commandId: 'drive-differential',
            targetId: 'microduck-sim',
            inputs: {
              leftPower: 0.5,
              rightPower: 1,
              durationMs: 100,
            },
          },
        ],
      }),
    );

    source.poll?.(1 / 50);

    expect(source).toMatchObject({
      id: 'botlab',
      connected: true,
      pressed: {
        forward: true,
        turnLeft: true,
      },
    });
    expect(source.command).toBe(commandRef);
    expect(source.axes).toBe(axesRef);
    expect([...source.command]).toEqual([1.5, 0, 0.75]);
    expect(source.isActive()).toBe(true);

    source.poll?.(1 / 50);

    expect([...source.command]).toEqual([1.5, 0, 0.75]);
    expect(source.isActive()).toBe(true);

    source.poll?.(0.08);
    source.poll?.(1 / 50);

    expect([...source.command]).toEqual([0, 0, 0]);
    expect(source.isActive()).toBe(false);
  });

  it('holds zero twist while executing an LED frame', () => {
    const source = createMicroDuckBotLabOfficialSource({
      getVelocityLimits: () => [2, -1, 3],
    });

    source.load(
      createMicroDuckSimulatorControlSource(createCompiledBehaviorArtifact()),
    );
    source.poll?.(1 / 50);

    expect([...source.command]).toEqual([0, 0, 0]);
    expect(source.axes.jaw).toBe(0.5);
    expect(source.pressed).toEqual({
      'led:smile': true,
    });
    expect(source.isActive()).toBe(true);
  });

  it('clears official source state when disposed', () => {
    const source = createMicroDuckBotLabOfficialSource({
      getVelocityLimits: () => [2, -1, 3],
    });

    source.load(
      createMicroDuckSimulatorControlSource(createCompiledBehaviorArtifact()),
    );
    source.poll?.(1 / 50);
    source.dispose?.();

    expect(source.connected).toBe(false);
    expect([...source.command]).toEqual([0, 0, 0]);
    expect(source.pressed).toEqual({});
    expect(source.axes).toEqual({
      jaw: 0,
      orbitX: 0,
      orbitY: 0,
      ride: 0,
    });
  });

  it('connects a BotLab source to a lazily loaded official simulator runtime', async () => {
    const sources: MicroDuckOfficialSimulatorSource[] = [];
    const connection = await connectMicroDuckBotLabSourceToOfficialSimulator({
      loadRuntime: async () => ({
        controller: {
          sources,
          addSource: (source) => sources.push(source),
        },
      }),
      getVelocityLimits: () => [2, -1, 3],
    });

    expect(sources).toEqual([connection.source]);

    connection.load(
      createMicroDuckSimulatorControlSource(createCompiledBehaviorArtifact()),
    );
    connection.source.poll?.(1 / 50);

    expect(connection.source.pressed).toEqual({
      'led:smile': true,
    });

    connection.disconnect();

    expect(connection.source.connected).toBe(false);
  });

  it('reuses an existing BotLab source when reconnecting to the same runtime', async () => {
    const runtime = createFakeOfficialRuntime();
    const first = await connectMicroDuckBotLabSourceToOfficialSimulator({
      loadRuntime: () => runtime,
      getVelocityLimits: () => [2, -1, 3],
      sourceId: 'botlab-test',
    });
    const second = await connectMicroDuckBotLabSourceToOfficialSimulator({
      loadRuntime: () => runtime,
      getVelocityLimits: () => [2, -1, 3],
      sourceId: 'botlab-test',
    });

    expect(runtime.controller.sources).toEqual([first.source]);
    expect(second.source).toBe(first.source);
  });

  it('serializes BotLab control frames for a simulator postMessage host', () => {
    const controlSource = createMicroDuckSimulatorControlSource(
      createCompiledBehaviorArtifact(),
    );
    const postedMessages: unknown[] = [];

    postMicroDuckSimulatorControlSource(
      {
        postMessage(message) {
          postedMessages.push(message);
        },
      },
      controlSource,
      'https://simulator.test',
    );

    expect(postedMessages).toEqual([
      createMicroDuckSimulatorControlMessage(controlSource),
    ]);
    expect(
      parseMicroDuckSimulatorControlMessage(postedMessages[0]),
    ).toMatchObject({
      simulatorId: 'microduck-official-sim',
      source: {
        artifactId: 'artifact-microduck-led-demo-microduck-sim-smile-plan',
        frames: [{ type: 'led-pattern', pattern: 'smile' }],
      },
    });
  });

  it('loads postMessage control frames into a BotLab simulator source', () => {
    const fakeWindow = createFakeMessageWindow();
    const source = createMicroDuckBotLabPostMessageSource({
      window: fakeWindow,
      allowedOrigins: ['https://botlab.test'],
      getVelocityLimits: () => [2, -1, 3],
    });

    source.init?.();
    fakeWindow.dispatch({
      origin: 'https://botlab.test',
      data: createMicroDuckSimulatorControlMessage(
        createMicroDuckSimulatorControlSource(createCompiledBehaviorArtifact()),
      ),
    });
    source.poll?.(1 / 50);

    expect(source.pressed).toEqual({
      'led:smile': true,
    });

    source.dispose?.();
    fakeWindow.dispatch({
      origin: 'https://botlab.test',
      data: createMicroDuckSimulatorControlMessage(
        createMicroDuckSimulatorControlSource({
          ...createCompiledBehaviorArtifact(),
          commands: [
            {
              ...createCompiledBehaviorArtifact().commands[0],
              inputs: {
                pattern: 'blink',
                brightness: 80,
              },
            },
          ],
        }),
      ),
    });
    source.poll?.(1 / 50);

    expect(source.pressed).toEqual({});
  });

  it('distinguishes a replay from retries of a completed execution', () => {
    const fakeWindow = createFakeMessageWindow();
    const source = createMicroDuckBotLabPostMessageSource({
      window: fakeWindow,
      allowedOrigins: ['https://botlab.test'],
      getVelocityLimits: () => [2, -1, 3],
    });
    const controlSource = createMicroDuckSimulatorControlSource(
      createCompiledBehaviorArtifact(),
    );
    const deliver = (executionId: string) =>
      fakeWindow.dispatch({
        origin: 'https://botlab.test',
        data: createMicroDuckSimulatorControlMessage(
          controlSource,
          executionId,
        ),
      });
    source.init?.();
    deliver('first');
    source.poll?.(0.02);
    source.axes.jaw = 0;
    deliver('first');
    source.poll?.(0.02);
    expect(source.axes.jaw).toBe(0);
    deliver('second');
    source.poll?.(0.02);
    expect(source.axes.jaw).toBe(0.5);
    source.axes.jaw = 0;
    deliver('first');
    source.poll?.(0.02);
    expect(source.axes.jaw).toBe(0);
    expect(
      parseMicroDuckSimulatorControlMessage({
        ...createMicroDuckSimulatorControlMessage(controlSource),
        executionId: 123,
      }),
    ).toBeUndefined();
    source.dispose?.();
  });

  it('ignores postMessage control frames from untrusted origins', () => {
    const fakeWindow = createFakeMessageWindow();
    const source = createMicroDuckBotLabPostMessageSource({
      window: fakeWindow,
      allowedOrigins: ['https://botlab.test'],
      getVelocityLimits: () => [2, -1, 3],
    });

    source.init?.();
    fakeWindow.dispatch({
      origin: 'https://other.test',
      data: createMicroDuckSimulatorControlMessage(
        createMicroDuckSimulatorControlSource(createCompiledBehaviorArtifact()),
      ),
    });
    source.poll?.(1 / 50);

    expect(source.pressed).toEqual({});
  });

  it('generates a simulator-side BotLab source module and patch hints', () => {
    const moduleSource = createMicroDuckBotLabPostMessageSourceModule({
      allowedOrigins: ['http://127.0.0.1:4200'],
    });

    expect(moduleSource).toContain(
      'const MESSAGE_TYPE = "botlab.microduck.control-source.v1";',
    );
    expect(moduleSource).toContain(
      'const ALLOWED_ORIGINS = ["http://127.0.0.1:4200"];',
    );
    expect(moduleSource).toContain('export class BotLabSource');
    expect(moduleSource).toContain('window.addEventListener("message"');
    expect(moduleSource).toContain('let latestControlSource;');
    expect(moduleSource).toContain('ACTIVE_SOURCES.add(this);');

    expect(createMicroDuckOfficialSimulatorPatchInstructions()).toEqual({
      modulePath: 'app/src/game/controls/botlab.js',
      gamePath: 'app/src/game/game.js',
      importLine: 'import { BotLabSource } from "./controls/botlab.js";',
      sourceFactoryLine: expect.stringContaining(
        'getPostureState: () => ({ supported: loco === "legs"',
      ),
      controllerSourceName: 'botLabSource',
    });
  });

  it('calibrates the default Feet reverse and angular inputs and preserves custom limits', () => {
    const limits = (loco: string, velocityLimitsExpression?: string) => {
      const { sourceFactoryLine } =
        createMicroDuckOfficialSimulatorPatchInstructions({
          velocityLimitsExpression,
        });
      const source = new Function(
        'BotLabSource',
        'loco',
        'VEL_FWD',
        'VEL_ANG',
        'velLims',
        `${sourceFactoryLine}; return botLabSource;`,
      )(
        class {
          constructor(options: object) {
            Object.assign(this, options);
          }
        },
        loco,
        0.25,
        1,
        () => (loco === 'legs' ? [0.25, -0.2, 1] : [0.6, -0.5, 0.3]),
      );
      return source.getVelocityLimits();
    };
    expect(limits('legs')).toEqual([0.25, -0.4, 2]);
    expect(limits('rollers')).toEqual([0.6, -0.5, 0.3]);
    expect(limits('legs', 'velLims()')).toEqual([0.25, -0.2, 1]);
  });

  it('patches official simulator game source to register BotLabSource', () => {
    const officialGameSource = [
      'import { Controller } from "./controls/controller.js";',
      'import { KeyboardSource } from "./controls/keyboard.js";',
      '',
      'function initControls(model) {',
      '  const kbSource = new KeyboardSource({ getVelocityLimits: () => model.getVelocityLimits() });',
      '  controller = new Controller({ sources: [kbSource] });',
      '}',
      '',
    ].join('\n');

    const result =
      patchMicroDuckOfficialSimulatorGameSource(officialGameSource);

    expect(result.warnings).toEqual([]);
    expect(result.changed).toBe(true);
    expect(result.source).toContain(
      'import { BotLabSource } from "./controls/botlab.js";',
    );
    expect(result.source).toContain(
      createMicroDuckOfficialSimulatorPatchInstructions().sourceFactoryLine,
    );
    expect(result.source).toContain(
      'controller = new Controller({ sources: [botLabSource, kbSource] });',
    );

    const second = patchMicroDuckOfficialSimulatorGameSource(result.source);

    expect(second.changed).toBe(false);
    expect(second.source).toBe(result.source);
  });

  it.each([
    '',
    ', isInputLocked: () => inputLocked',
    ', isInputLocked: () => inputLocked, getPosition: () => [data.qpos[0], data.qpos[1]]',
    ', isInputLocked: () => inputLocked, getPosition: () => [data.qpos[0], data.qpos[1]], getHeading: () => duckYaw(data.qpos)',
  ])(
    'upgrades an existing simulator patch without declaring the source twice: %s',
    (callbacks) => {
      const previous = [
        `const botLabSource = new BotLabSource({ getVelocityLimits: () => velLims()${callbacks} });`,
        'const controller = new Controller({ sources: [botLabSource, kbSource] });',
      ].join('\n');
      const result = patchMicroDuckOfficialSimulatorGameSource(previous);
      expect(result.source.match(/const botLabSource =/g)).toHaveLength(1);
      expect(result.source).toContain('isInputLocked: () => inputLocked');
      expect(result.source).toContain('[VEL_FWD, -0.4, 2]');
      expect(
        patchMicroDuckOfficialSimulatorGameSource(result.source).changed,
      ).toBe(false);
    },
  );

  it('upgrades a reverse-calibrated host to the measured turn calibration exactly once', () => {
    const previous =
      createMicroDuckOfficialSimulatorPatchInstructions().sourceFactoryLine.replace(
        '[VEL_FWD, -0.4, 2]',
        '[VEL_FWD, -0.4, VEL_ANG]',
      );
    const result = patchMicroDuckOfficialSimulatorGameSource(previous);
    expect(result.source.match(/const botLabSource =/g)).toHaveLength(1);
    expect(result.source).toContain(
      createMicroDuckOfficialSimulatorPatchInstructions().sourceFactoryLine,
    );
    expect(
      patchMicroDuckOfficialSimulatorGameSource(result.source).changed,
    ).toBe(false);
  });

  it('executes the generated receiver once after startup unlock, despite delivery retries', () => {
    const receiverWindow = new EventTarget();
    const moduleSource = createMicroDuckBotLabPostMessageSourceModule({
      allowedOrigins: ['http://127.0.0.1:4200'],
    });
    const BotLabSource = new Function(
      'window',
      moduleSource.replace('export class BotLabSource', 'class BotLabSource') +
        '\nreturn BotLabSource;',
    )(receiverWindow);
    const sourceData = {
      artifactId: 'walk-test',
      targetId: 'microduck-sim',
      frames: [
        {
          id: 'walk',
          type: 'differential-drive' as const,
          targetId: 'microduck-sim',
          leftPower: 1,
          rightPower: 1,
          durationMs: 100,
        },
      ],
      messages: [],
      errors: [],
    };
    const deliver = (
      origin = 'http://127.0.0.1:4200',
      executionId?: string,
    ) => {
      receiverWindow.dispatchEvent(
        new MessageEvent('message', {
          origin,
          data: createMicroDuckSimulatorControlMessage(sourceData, executionId),
        }),
      );
    };

    // Buffer before the controller exists, then preserve frames during its entrance.
    deliver();
    let locked = true;
    const source = new BotLabSource({ isInputLocked: () => locked });
    source.init();
    source.poll(10);
    expect(source.cursor).toBe(0);
    expect(Array.from(source.command)).toEqual([0, 0, 0]);

    locked = false;
    source.poll(0.04);
    expect(Array.from(source.command)).toEqual([2, 0, 0]);
    deliver();
    source.poll(0.06);
    source.poll(0.02);
    expect(source.cursor).toBe(1);
    expect(Array.from(source.command)).toEqual([0, 0, 0]);

    deliver();
    source.poll(0.02);
    expect(source.cursor).toBe(1);
    expect(source.isActive()).toBe(false);

    deliver('http://127.0.0.1:4200', 'run-2');
    source.poll(0.04);
    expect(Array.from(source.command)).toEqual([2, 0, 0]);
    deliver();
    deliver('http://127.0.0.1:4200', 'run-2');
    source.poll(0.06);
    source.poll(0.02);
    expect(source.cursor).toBe(1);
    expect(source.isActive()).toBe(false);

    sourceData.artifactId = 'untrusted-program';
    deliver('https://untrusted.example');
    source.poll(0.02);
    expect(source.cursor).toBe(1);
    source.dispose();
  });

  it('allows educational preview host loading while assets still need review', async () => {
    const runtime = createFakeOfficialRuntime();

    await expect(
      loadMicroDuckOfficialSimulatorHost({
        assetPlan: createMicroDuckSimulatorAssetCachePlan(
          microDuckSimulatorAssetManifest,
        ),
        artifact: createCompiledBehaviorArtifact(),
        loadRuntime: () => runtime,
        getVelocityLimits: () => [2, -1, 3],
      }),
    ).resolves.toMatchObject({
      state: 'running',
      messages: [
        'Loaded 1 BotLab control frame(s) into the official simulator source.',
        'MicroDuck MuJoCo robot models: pending-review. BotLab will not vendor this asset; educational preview loading remains opt-in.',
        'MicroDuck official policy manifest: pending-review. BotLab will not vendor this asset; educational preview loading remains opt-in.',
        'MicroDuck browser sandbox source: pending-review. BotLab will not vendor this asset; educational preview loading remains opt-in.',
        'led-pattern -> {"pattern":"smile","brightness":50}',
      ],
    });
    expect(runtime.controller.sources).toHaveLength(1);
  });

  it('blocks official simulator host loading for restricted assets', async () => {
    const manifest = createReviewedAssetManifest({
      assets: [
        {
          ...createReviewedAssetManifest().assets[0],
          license: {
            status: 'restricted',
            notes: 'Restricted test asset.',
          },
        },
      ],
    });

    await expect(
      loadMicroDuckOfficialSimulatorHost({
        assetPlan: createMicroDuckSimulatorAssetCachePlan(manifest),
        artifact: createCompiledBehaviorArtifact(),
        loadRuntime: createFakeOfficialRuntime,
        getVelocityLimits: () => [2, -1, 3],
      }),
    ).resolves.toMatchObject({
      state: 'blocked',
      messages: [
        'MicroDuck official simulator runtime is blocked because at least one required asset is restricted.',
        'Reviewed policy: blocked',
      ],
    });
  });

  it('loads BotLab control frames into an official simulator host when assets are ready', async () => {
    const runtime = createFakeOfficialRuntime();
    const result = await loadMicroDuckOfficialSimulatorHost({
      assetPlan: createMicroDuckSimulatorAssetCachePlan(
        createReviewedAssetManifest(),
        [{ id: 'reviewed-policy', sha256: 'a'.repeat(64) }],
      ),
      artifact: createCompiledBehaviorArtifact(),
      loadRuntime: () => runtime,
      getVelocityLimits: () => [2, -1, 3],
    });

    expect(result).toMatchObject({
      state: 'running',
      controlSource: {
        artifactId: 'artifact-microduck-led-demo-microduck-sim-smile-plan',
        frames: [{ type: 'led-pattern' }],
      },
      messages: [
        'Loaded 1 BotLab control frame(s) into the official simulator source.',
        'led-pattern -> {"pattern":"smile","brightness":50}',
      ],
    });
    expect(runtime.controller.sources).toHaveLength(1);
    expect(runtime.controller.sources[0].pressed).toEqual({});

    runtime.controller.sources[0].poll?.(1 / 50);

    expect(runtime.controller.sources[0].pressed).toEqual({
      'led:smile': true,
    });
  });
});

describe('microDuckSimulatorAssetManifest', () => {
  it('documents upstream assets without marking unreviewed assets ready', () => {
    expect(
      validateMicroDuckSimulatorAssetManifest(microDuckSimulatorAssetManifest),
    ).toEqual({
      valid: true,
      errors: [],
    });

    const plan = createMicroDuckSimulatorAssetCachePlan(
      microDuckSimulatorAssetManifest,
    );

    expect(plan.ready).toBe(false);
    expect(plan.loadable).toBe(true);
    expect(plan.entries.map((entry) => entry.status)).toEqual([
      'pending-review',
      'pending-review',
      'pending-review',
    ]);
  });

  it('marks reviewed and hashed assets as missing, stale, or ready', () => {
    const manifest = createReviewedAssetManifest();

    expect(
      createMicroDuckSimulatorAssetCachePlan(manifest).entries[0],
    ).toMatchObject({
      status: 'missing',
    });
    expect(
      createMicroDuckSimulatorAssetCachePlan(manifest, [
        { id: 'reviewed-policy', sha256: '0'.repeat(64) },
      ]).entries[0],
    ).toMatchObject({
      status: 'stale',
    });
    expect(
      createMicroDuckSimulatorAssetCachePlan(manifest, [
        { id: 'reviewed-policy', sha256: 'a'.repeat(64) },
      ]),
    ).toMatchObject({
      ready: true,
      entries: [{ status: 'ready' }],
    });
  });

  it('rejects duplicate assets, absolute cache paths, and invalid hashes', () => {
    const manifest = createReviewedAssetManifest({
      assets: [
        {
          ...createReviewedAssetManifest().assets[0],
          cache: { path: '/absolute/path' },
          expectedSha256: 'not-a-sha',
        },
        createReviewedAssetManifest().assets[0],
      ],
    });

    expect(validateMicroDuckSimulatorAssetManifest(manifest).errors).toEqual([
      'Asset reviewed-policy cache path must be relative.',
      'Asset reviewed-policy expectedSha256 must be a SHA-256 hex digest.',
      'Manifest test-manifest has duplicate asset reviewed-policy.',
    ]);
  });

  it('inspects a cache store using the manifest hash function', async () => {
    const manifest = createReviewedAssetManifest();
    const cache = createMemoryAssetCache({
      'reviewed-policy': new Uint8Array([1]),
    });

    await expect(
      inspectMicroDuckSimulatorAssetCache(manifest, cache, hashTestBytes),
    ).resolves.toMatchObject({
      ready: true,
      entries: [{ status: 'ready' }],
    });
  });

  it('downloads missing reviewed assets and verifies their hashes before writing', async () => {
    const manifest = createReviewedAssetManifest();
    const cache = createMemoryAssetCache();
    const result = await setupMicroDuckSimulatorAssetCache({
      manifest,
      cache,
      downloader: {
        download: () => new Uint8Array([1]),
      },
      hashBytes: hashTestBytes,
    });

    expect(result).toMatchObject({
      downloadedAssetIds: ['reviewed-policy'],
      skippedAssetIds: [],
      errors: [],
      plan: {
        ready: true,
        entries: [{ status: 'ready' }],
      },
    });
    expect(cache.read(manifest.assets[0])).toEqual(new Uint8Array([1]));
  });

  it('refuses to write downloads whose hash does not match the manifest', async () => {
    const manifest = createReviewedAssetManifest();
    const cache = createMemoryAssetCache();
    const result = await setupMicroDuckSimulatorAssetCache({
      manifest,
      cache,
      downloader: {
        download: () => new Uint8Array([2]),
      },
      hashBytes: hashTestBytes,
    });

    expect(result).toMatchObject({
      downloadedAssetIds: [],
      skippedAssetIds: ['reviewed-policy'],
      errors: [
        `Downloaded asset reviewed-policy has SHA-256 ${'b'.repeat(
          64,
        )}, expected ${'a'.repeat(64)}.`,
      ],
      plan: {
        ready: false,
        entries: [{ status: 'missing' }],
      },
    });
    expect(cache.read(manifest.assets[0])).toBeUndefined();
  });

  it('does not download assets that are still pending license review', async () => {
    const downloadCalls: string[] = [];
    const cache = createMemoryAssetCache();
    const result = await setupMicroDuckSimulatorAssetCache({
      manifest: microDuckSimulatorAssetManifest,
      cache,
      downloader: {
        download: (asset) => {
          downloadCalls.push(asset.id);
          return new Uint8Array([1]);
        },
      },
      hashBytes: hashTestBytes,
    });

    expect(downloadCalls).toEqual([]);
    expect(result).toMatchObject({
      downloadedAssetIds: [],
      skippedAssetIds: [
        'microduck-rl-mjcf-models',
        'microduck-official-policy-manifest',
        'microduck-browser-sandbox-source',
      ],
      errors: [],
      plan: {
        ready: false,
      },
    });
  });

  it('stores browser cache assets behind stable cache requests', async () => {
    const manifest = createReviewedAssetManifest();
    const cacheStorage = createFakeCacheStorage();
    const cache = createMicroDuckBrowserAssetCacheStore({
      cacheName: 'test-microduck-cache',
      cacheBaseUrl: 'https://botlab.test/cache/',
      cacheStorage,
    });

    await cache.write(manifest.assets[0], new Uint8Array([1, 2, 3]));

    await expect(cache.read(manifest.assets[0])).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(cacheStorage.writtenUrls).toEqual([
      'https://botlab.test/cache/microduck/policies/policy.onnx',
    ]);
  });

  it('downloads assets with fetch and reports HTTP failures', async () => {
    const asset = createReviewedAssetManifest().assets[0];
    const downloader = createMicroDuckFetchAssetDownloader(
      async () => new Response(new Uint8Array([1, 2]), { status: 200 }),
    );

    await expect(downloader.download(asset)).resolves.toEqual(
      new Uint8Array([1, 2]),
    );

    const failingDownloader = createMicroDuckFetchAssetDownloader(
      async () => new Response(undefined, { status: 404 }),
    );

    await expect(failingDownloader.download(asset)).rejects.toThrow(
      'HTTP 404 while downloading https://example.test/policy.onnx.',
    );
  });

  it('hashes asset bytes with Web Crypto SHA-256', async () => {
    await expect(
      sha256MicroDuckSimulatorAssetBytes(new Uint8Array([1])),
    ).resolves.toBe(
      '4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a',
    );
  });
});

function createMicroDuckSimulatorTarget(): Target {
  return {
    id: 'microduck-sim',
    name: 'MicroDuck simulator',
    kind: 'simulator',
    adapterId: 'microduck',
    status: 'available',
    profile: {
      hardware: {
        family: 'MicroDuck',
      },
      simulator: {
        supported: true,
        integrationId: 'microduck-official-sim',
      },
      connection: {
        modes: ['simulator'],
        defaultMode: 'simulator',
        discovery: 'automatic',
      },
    },
  };
}

function createCompiledBehaviorArtifact(): CompiledBehaviorArtifact {
  return {
    id: 'artifact-microduck-led-demo-microduck-sim-smile-plan',
    kind: 'compiled-plan',
    label: 'MicroDuck LED demo',
    createdAt: '2026-09-11T00:00:00.000Z',
    behaviorId: 'microduck-led-demo',
    targetId: 'microduck-sim',
    requiredPolicyIds: ['safe-demo-policy'],
    commands: [
      {
        id: 'cmd-microduck-leds',
        capabilityId: 'microduck-leds',
        commandId: 'set-led-pattern',
        targetId: 'microduck-sim',
        inputs: {
          pattern: 'smile',
          brightness: 50,
        },
      },
    ],
  };
}

function createReviewedAssetManifest(
  overrides: Partial<MicroDuckSimulatorAssetManifest> = {},
): MicroDuckSimulatorAssetManifest {
  return {
    id: 'test-manifest',
    version: 1,
    simulatorId: 'microduck-official-sim',
    upstreamRevision: 'test-revision',
    assets: [
      {
        id: 'reviewed-policy',
        label: 'Reviewed policy',
        kind: 'policy',
        required: true,
        source: {
          url: 'https://example.test/policy.onnx',
          revision: 'test-revision',
        },
        cache: {
          path: 'microduck/policies/policy.onnx',
        },
        license: {
          status: 'verified',
          notes: 'Test asset.',
        },
        expectedSha256: 'a'.repeat(64),
      },
    ],
    ...overrides,
  };
}

function createMemoryAssetCache(
  initialAssets: Record<string, Uint8Array> = {},
): MicroDuckSimulatorAssetCacheStore {
  const assets = new Map(Object.entries(initialAssets));

  return {
    read(asset: MicroDuckSimulatorAssetManifestEntry) {
      return assets.get(asset.id);
    },
    write(asset: MicroDuckSimulatorAssetManifestEntry, bytes: Uint8Array) {
      assets.set(asset.id, bytes);
    },
  };
}

function hashTestBytes(bytes: Uint8Array) {
  if (bytes[0] === 1) {
    return 'a'.repeat(64);
  }

  if (bytes[0] === 2) {
    return 'b'.repeat(64);
  }

  return '0'.repeat(64);
}

function createFakeCacheStorage() {
  const responses = new Map<string, Response>();
  const writtenUrls: string[] = [];
  const cache = {
    async match(request: Request) {
      return responses.get(request.url);
    },
    async put(request: Request, response: Response) {
      writtenUrls.push(request.url);
      responses.set(request.url, response);
    },
  };

  return {
    writtenUrls,
    async open() {
      return cache;
    },
  } as unknown as CacheStorage & { writtenUrls: string[] };
}

function createFakeOfficialRuntime() {
  const sources: MicroDuckOfficialSimulatorSource[] = [];

  return {
    controller: {
      sources,
      addSource: (source: MicroDuckOfficialSimulatorSource) => {
        sources.push(source);
      },
    },
  };
}

function createFakeMessageWindow() {
  const listeners = new Set<(event: MessageEvent) => void>();

  return {
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) {
      if (type !== 'message' || typeof listener !== 'function') {
        return;
      }

      listeners.add(listener as (event: MessageEvent) => void);
    },
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
    ) {
      if (type !== 'message' || typeof listener !== 'function') {
        return;
      }

      listeners.delete(listener as (event: MessageEvent) => void);
    },
    dispatch(event: Pick<MessageEvent, 'origin' | 'data'>) {
      for (const listener of listeners) {
        listener(event as MessageEvent);
      }
    },
  };
}
