import type {
  RuntimeCommandDispatcher,
  RuntimeCommandDispatchResult,
} from './runtime';
import { createBotLabRuntime } from './runtime';
import {
  sampleMicroDuckCompiledBehaviorArtifact,
  sampleMicroDuckLedBehavior,
  sampleArbitrationStrategies,
  samplePolicies,
  sampleSchedulers,
  sampleSkills,
  type BotLabAdapter,
  type CompiledCommand,
} from '@botlab/model';

describe('runtime', () => {
  it('keeps the existing target and capability registry facade', () => {
    const runtime = createBotLabRuntime({
      adapters: [microDuckAdapter],
      simulators: [],
    });

    expect(runtime.listTargets()).toHaveLength(1);
    expect(runtime.listCapabilities()).toHaveLength(1);
    expect(runtime.inspectTarget('microduck-usb')).toMatchObject({
      targetId: 'microduck-usb',
      health: 'nominal',
    });
  });

  it('summarizes runtime state through introspection snapshots', () => {
    const runtime = createTestRuntime();
    const session = runtime.createSession({ id: 'session-introspection' });

    runtime.loadCompiledBehavior(
      session.id,
      sampleMicroDuckCompiledBehaviorArtifact,
    );

    expect(runtime.inspectRuntime()).toMatchObject({
      generatedAt: '2026-09-10T00:00:00.000Z',
      targets: expect.arrayContaining([
        expect.objectContaining({ id: 'microduck-usb' }),
      ]),
      capabilities: expect.arrayContaining([
        expect.objectContaining({ id: 'microduck-leds' }),
      ]),
      sessions: [
        expect.objectContaining({
          id: 'session-introspection',
          state: 'awaiting-confirmation',
          targetId: 'microduck-usb',
          behaviorId: 'microduck-led-demo',
        }),
      ],
      activeSessionCount: 1,
      diagnostics: [
        expect.objectContaining({
          category: 'policy',
          code: 'policy-confirmation-required',
          severity: 'warning',
        }),
      ],
      recentEvents: expect.arrayContaining([
        expect.objectContaining({ type: 'session-created' }),
        expect.objectContaining({ type: 'artifact-loaded' }),
        expect.objectContaining({ type: 'policy-evaluated' }),
      ]),
    });
  });

  it('loads a compiled behavior plan into a runtime session', () => {
    const runtime = createTestRuntime();
    const session = runtime.createSession({ id: 'session-a' });
    const result = runtime.loadCompiledBehavior(
      session.id,
      sampleMicroDuckCompiledBehaviorArtifact,
    );

    expect(result.validation).toEqual({ valid: true, errors: [] });
    expect(result.snapshot).toMatchObject({
      id: 'session-a',
      state: 'awaiting-confirmation',
      behaviorId: 'microduck-led-demo',
      targetId: 'microduck-usb',
      loadedArtifactId: 'artifact-microduck-leds-plan',
    });
    expect(result.snapshot.policyEvaluation).toMatchObject({
      decision: 'require-confirmation',
      policyIds: ['confirm-visible-output'],
      ruleIds: ['confirm-led-output'],
    });
  });

  it('loads a validated behavior before compilation', () => {
    const runtime = createTestRuntime();
    const session = runtime.createSession({ id: 'session-behavior' });
    const result = runtime.loadBehavior(session.id, sampleMicroDuckLedBehavior);

    expect(result.validation).toEqual({ valid: true, errors: [] });
    expect(result.snapshot).toMatchObject({
      id: 'session-behavior',
      state: 'ready',
      behaviorId: 'microduck-led-demo',
    });
  });

  it('dispatches compiled commands through a target dispatcher', async () => {
    const dispatchedCommands: CompiledCommand[] = [];
    const runtime = createTestRuntime({
      dispatch(command) {
        dispatchedCommands.push(command);

        return {
          commandId: command.id,
          status: 'dispatched',
          message: `Dispatched ${command.commandId}.`,
        };
      },
    });

    const session = runtime.createSession({ id: 'session-dispatch' });
    runtime.loadCompiledBehavior(
      session.id,
      sampleMicroDuckCompiledBehaviorArtifact,
    );
    runtime.confirmPolicy(session.id);

    const result = await runtime.startSession(session.id);

    expect(dispatchedCommands).toHaveLength(1);
    expect(result.dispatchResults).toEqual([
      {
        commandId: 'command-microduck-leds-smile',
        status: 'dispatched',
        message: 'Dispatched set-led-pattern.',
      },
    ]);
    expect(result.snapshot).toMatchObject({
      state: 'stopped',
      dispatchedCommandCount: 1,
    });
    expect(runtime.getSessionTrace(session.id)).toMatchObject({
      kind: 'trace',
      sessionId: 'session-dispatch',
      behaviorId: 'microduck-led-demo',
      targetId: 'microduck-usb',
    });
  });

  it('emits runtime events for session lifecycle and dispatch', async () => {
    const runtime = createTestRuntime({
      dispatch(command) {
        return {
          commandId: command.id,
          status: 'dispatched',
          message: `Dispatched ${command.commandId}.`,
        };
      },
    });
    const events: string[] = [];
    const unsubscribe = runtime.subscribe((event) => events.push(event.type));
    const session = runtime.createSession({ id: 'session-events' });

    runtime.loadCompiledBehavior(
      session.id,
      sampleMicroDuckCompiledBehaviorArtifact,
    );
    runtime.confirmPolicy(session.id);
    await runtime.startSession(session.id);
    unsubscribe();
    runtime.pauseSession(session.id);

    expect(events).toEqual([
      'session-created',
      'policy-evaluated',
      'artifact-loaded',
      'policy-confirmed',
      'session-started',
      'command-dispatched',
      'session-stopped',
    ]);
  });

  it('rejects invalid compiled plans before dispatch', () => {
    const runtime = createTestRuntime();
    const session = runtime.createSession({ id: 'session-invalid' });
    const result = runtime.loadCompiledBehavior(session.id, {
      ...sampleMicroDuckCompiledBehaviorArtifact,
      commands: [
        {
          ...sampleMicroDuckCompiledBehaviorArtifact.commands[0],
          commandId: 'missing-command',
        },
      ],
    });

    expect(result.validation.valid).toBe(false);
    expect(result.snapshot.state).toBe('error');
    expect(result.snapshot.diagnostics).toEqual([
      expect.objectContaining({
        category: 'validation',
        code: 'compiled-artifact-validation-failed',
        severity: 'error',
      }),
    ]);
    expect(result.validation.errors).toContain(
      'Compiled command command-microduck-leds-smile references unknown command missing-command on capability microduck-leds.',
    );
  });

  it('records lifecycle diagnostics when a session starts without a compiled plan', async () => {
    const runtime = createTestRuntime();
    const session = runtime.createSession({ id: 'session-no-plan' });
    const result = await runtime.startSession(session.id);

    expect(result.snapshot).toMatchObject({
      state: 'error',
      dispatchedCommandCount: 0,
    });
    expect(result.snapshot.diagnostics).toEqual([
      expect.objectContaining({
        category: 'lifecycle',
        code: 'missing-compiled-artifact',
      }),
    ]);
    expect(runtime.inspectRuntime().diagnostics).toHaveLength(1);
  });

  it('marks target health as degraded when one of its sessions is in error', async () => {
    const runtime = createTestRuntime();
    const session = runtime.createSession({ id: 'session-target-error' });

    runtime.loadCompiledBehavior(
      session.id,
      sampleMicroDuckCompiledBehaviorArtifact,
    );
    runtime.confirmPolicy(session.id);
    await runtime.startSession(session.id);

    expect(runtime.inspectTarget('microduck-usb')).toMatchObject({
      targetId: 'microduck-usb',
      health: 'degraded',
      messages: [
        'MicroDuck USB is registered through microduck.',
        '1 runtime session(s) reference this target.',
      ],
    });
  });

  it('does not dispatch commands until required policy is confirmed', async () => {
    const runtime = createTestRuntime({
      dispatch(command) {
        return {
          commandId: command.id,
          status: 'dispatched',
          message: `Dispatched ${command.commandId}.`,
        };
      },
    });
    const session = runtime.createSession({ id: 'session-needs-confirmation' });

    runtime.loadCompiledBehavior(
      session.id,
      sampleMicroDuckCompiledBehaviorArtifact,
    );
    const result = await runtime.startSession(session.id);

    expect(result.dispatchResults).toEqual([]);
    expect(result.snapshot).toMatchObject({
      state: 'awaiting-confirmation',
      dispatchedCommandCount: 0,
    });
    expect(result.snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'policy',
          code: 'policy-confirmation-required',
          severity: 'warning',
        }),
      ]),
    );
  });

  it('queues runtime sessions by priority', async () => {
    const runtime = createTestRuntime({
      dispatch(command) {
        return {
          commandId: command.id,
          status: 'dispatched',
          message: `Dispatched ${command.commandId}.`,
        };
      },
    });
    const lowPrioritySession = runtime.createSession({
      id: 'session-low-priority',
    });
    const highPrioritySession = runtime.createSession({
      id: 'session-high-priority',
    });

    runtime.loadCompiledBehavior(
      lowPrioritySession.id,
      sampleMicroDuckCompiledBehaviorArtifact,
    );
    runtime.loadCompiledBehavior(
      highPrioritySession.id,
      sampleMicroDuckCompiledBehaviorArtifact,
    );
    runtime.confirmPolicy(lowPrioritySession.id);
    runtime.confirmPolicy(highPrioritySession.id);

    runtime.queueSession(lowPrioritySession.id, { priority: 1 });
    const queue = runtime.queueSession(highPrioritySession.id, {
      priority: 10,
    });

    expect(queue.entries.map((entry) => entry.sessionId)).toEqual([
      'session-high-priority',
      'session-low-priority',
    ]);
    expect(runtime.inspectSession(highPrioritySession.id)).toMatchObject({
      state: 'queued',
    });

    const result = await runtime.runNextQueuedSession();

    expect(result?.snapshot).toMatchObject({
      id: 'session-high-priority',
      state: 'stopped',
      dispatchedCommandCount: 1,
    });
    expect(
      runtime.inspectQueue().entries.map((entry) => entry.sessionId),
    ).toEqual(['session-low-priority']);
  });

  it('prevents concurrent sessions from locking the same capability', async () => {
    let releaseDispatch!: () => void;
    const pendingDispatch = new Promise<void>((resolve) => {
      releaseDispatch = resolve;
    });
    const runtime = createTestRuntime({
      async dispatch(command) {
        await pendingDispatch;

        return {
          commandId: command.id,
          status: 'dispatched',
          message: `Dispatched ${command.commandId}.`,
        };
      },
    });
    const firstSession = runtime.createSession({ id: 'session-lock-owner' });
    const secondSession = runtime.createSession({
      id: 'session-lock-conflict',
    });

    runtime.loadCompiledBehavior(
      firstSession.id,
      sampleMicroDuckCompiledBehaviorArtifact,
    );
    runtime.loadCompiledBehavior(
      secondSession.id,
      sampleMicroDuckCompiledBehaviorArtifact,
    );
    runtime.confirmPolicy(firstSession.id);
    runtime.confirmPolicy(secondSession.id);

    const firstRun = runtime.startSession(firstSession.id);
    const secondRun = await runtime.startSession(secondSession.id);

    expect(runtime.inspectQueue().capabilityLocks).toEqual([
      expect.objectContaining({
        capabilityId: 'microduck-leds',
        sessionId: 'session-lock-owner',
      }),
    ]);
    expect(secondRun.snapshot).toMatchObject({
      state: 'error',
      dispatchedCommandCount: 0,
    });
    expect(secondRun.snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'arbitration',
          code: 'capability-lock-conflict',
        }),
      ]),
    );

    releaseDispatch();
    await firstRun;

    expect(runtime.inspectQueue().capabilityLocks).toEqual([]);
  });

  it('denies compiled plans when a matching policy rule denies execution', () => {
    const runtime = createTestRuntime(undefined, [
      ...samplePolicies,
      {
        id: 'deny-microduck-leds',
        name: 'Deny MicroDuck LEDs',
        rules: [
          {
            id: 'deny-led-command',
            category: 'safety',
            effect: 'deny',
            description: 'Block LED commands in this test profile.',
            capabilityIds: ['microduck-leds'],
          },
        ],
      },
    ]);
    const session = runtime.createSession({ id: 'session-denied' });
    const result = runtime.loadCompiledBehavior(
      session.id,
      sampleMicroDuckCompiledBehaviorArtifact,
    );

    expect(result.snapshot).toMatchObject({
      state: 'error',
      policyEvaluation: expect.objectContaining({
        decision: 'deny',
        policyIds: expect.arrayContaining(['deny-microduck-leds']),
        ruleIds: expect.arrayContaining(['deny-led-command']),
      }),
    });
    expect(result.snapshot.diagnostics).toEqual([
      expect.objectContaining({
        category: 'policy',
        code: 'policy-denied',
        severity: 'error',
      }),
    ]);
  });

  it('pauses at a command boundary and resumes without replaying commands', async () => {
    const first = deferred<RuntimeCommandDispatchResult>();
    const calls: string[] = [];
    const runtime = createTestRuntime({
      dispatch(command) {
        calls.push(command.id);
        return calls.length === 1 ? first.promise : dispatched(command.id);
      },
    });
    const session = loadTwoCommandSession(runtime);
    const run = runtime.startSession(session.id);
    runtime.pauseSession(session.id);
    first.resolve(dispatched('first'));
    await flushMicrotasks();
    expect(calls).toEqual(['first']);
    expect(runtime.inspectSession(session.id).state).toBe('paused');
    expect((await runtime.startSession(session.id)).dispatchResults).toEqual(
      [],
    );
    runtime.queueSession(session.id);
    expect(runtime.inspectQueue().entries).toEqual([]);
    runtime.resumeSession(session.id);
    const result = await run;
    expect(calls).toEqual(['first', 'second']);
    expect(result.snapshot).toMatchObject({
      state: 'stopped',
      dispatchedCommandCount: 2,
    });
    expect(runtime.inspectQueue().capabilityLocks).toEqual([]);
  });

  it.each(['stopSession', 'disposeSession'] as const)(
    '%s prevents the next dispatch and preserves terminal state after a late result',
    async (action) => {
      const first = deferred<RuntimeCommandDispatchResult>();
      const calls: string[] = [];
      let signal: AbortSignal | undefined;
      const runtime = createTestRuntime({
        dispatch(command, context) {
          calls.push(command.id);
          signal = context.signal;
          return first.promise;
        },
      });
      const session = loadTwoCommandSession(runtime);
      const run = runtime.startSession(session.id);
      const terminal = runtime[action](session.id).state;
      expect(signal?.aborted).toBe(true);
      // An uncooperative transport still owns its in-flight capability.
      expect(runtime.inspectQueue().capabilityLocks).toHaveLength(1);
      expect((await runtime.startSession(session.id)).dispatchResults).toEqual(
        [],
      );
      first.resolve(dispatched('first'));
      const result = await run;
      expect(calls).toEqual(['first']);
      expect(result.snapshot.state).toBe(terminal);
      expect(
        result.snapshot.trace.some((entry) =>
          entry.message.includes('completed.'),
        ),
      ).toBe(false);
      expect(runtime.inspectQueue().capabilityLocks).toEqual([]);
      expect((await runtime.startSession(session.id)).dispatchResults).toEqual(
        [],
      );
    },
  );

  it('preserves cancellation when an abort-aware dispatcher rejects', async () => {
    const calls: string[] = [];
    const runtime = createTestRuntime({
      dispatch(command, { signal }) {
        calls.push(command.id);
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new Error('Transport cancelled.')),
            { once: true },
          );
        });
      },
    });
    const session = loadTwoCommandSession(runtime);
    const run = runtime.startSession(session.id);
    runtime.stopSession(session.id);
    expect((await run).snapshot.state).toBe('stopped');
    expect(calls).toEqual(['first']);
    expect(runtime.inspectQueue().capabilityLocks).toEqual([]);
  });

  it('can stop a run waiting for resume without dispatching another command', async () => {
    const first = deferred<RuntimeCommandDispatchResult>();
    const calls: string[] = [];
    const runtime = createTestRuntime({
      dispatch(command) {
        calls.push(command.id);
        return first.promise;
      },
    });
    const session = loadTwoCommandSession(runtime);
    const run = runtime.startSession(session.id);
    runtime.pauseSession(session.id);
    first.resolve(dispatched('first'));
    await flushMicrotasks();
    runtime.stopSession(session.id);
    expect((await run).snapshot.state).toBe('stopped');
    expect(calls).toEqual(['first']);
  });

  it.each(['stopSession', 'disposeSession'] as const)(
    '%s removes queued work permanently',
    async (action) => {
      const calls: string[] = [];
      const runtime = createTestRuntime({
        dispatch(command) {
          calls.push(command.id);
          return dispatched(command.id);
        },
      });
      const session = loadTwoCommandSession(runtime);
      runtime.queueSession(session.id);
      const terminal = runtime[action](session.id).state;
      expect(runtime.inspectQueue().entries).toEqual([]);
      expect(await runtime.runNextQueuedSession()).toBeUndefined();
      runtime.queueSession(session.id);
      expect(runtime.inspectQueue().entries).toEqual([]);
      expect(runtime.inspectSession(session.id).state).toBe(terminal);
      expect(calls).toEqual([]);
    },
  );

  it('removes a queue entry when the same session is started directly', async () => {
    const runtime = createTestRuntime({
      dispatch: (command) => dispatched(command.id),
    });
    const session = loadTwoCommandSession(runtime);
    runtime.queueSession(session.id);
    await runtime.startSession(session.id);
    expect(await runtime.runNextQueuedSession()).toBeUndefined();
    expect(runtime.inspectSession(session.id).dispatchedCommandCount).toBe(2);
  });

  it('rejects plan replacement during dispatch and invalidates approval on later load', async () => {
    const first = deferred<RuntimeCommandDispatchResult>();
    const runtime = createTestRuntime({ dispatch: () => first.promise });
    const session = loadTwoCommandSession(runtime);
    const run = runtime.startSession(session.id);
    expect(
      runtime.loadCompiledBehavior(
        session.id,
        sampleMicroDuckCompiledBehaviorArtifact,
      ).validation.valid,
    ).toBe(false);
    expect(
      runtime.loadBehavior(session.id, sampleMicroDuckLedBehavior).validation
        .valid,
    ).toBe(false);
    expect(runtime.inspectSession(session.id).state).toBe('running');
    runtime.stopSession(session.id);
    expect(
      runtime.loadCompiledBehavior(
        session.id,
        sampleMicroDuckCompiledBehaviorArtifact,
      ).validation.valid,
    ).toBe(false);
    first.resolve(dispatched('first'));
    await run;
    expect(
      runtime.loadCompiledBehavior(
        session.id,
        sampleMicroDuckCompiledBehaviorArtifact,
      ).validation.valid,
    ).toBe(true);
    expect((await runtime.startSession(session.id)).snapshot.state).toBe(
      'awaiting-confirmation',
    );
  });

  it('cannot resurrect a disposed session by loading or resuming', () => {
    const runtime = createTestRuntime();
    const session = loadTwoCommandSession(runtime);
    runtime.disposeSession(session.id);
    expect(
      runtime.loadCompiledBehavior(
        session.id,
        sampleMicroDuckCompiledBehaviorArtifact,
      ).validation.valid,
    ).toBe(false);
    expect(
      runtime.loadBehavior(session.id, sampleMicroDuckLedBehavior).validation
        .valid,
    ).toBe(false);
    expect(runtime.resumeSession(session.id).state).toBe('disposed');
  });

  it('does not resume a ready or stopped session without an active run', () => {
    const runtime = createTestRuntime();
    const session = loadTwoCommandSession(runtime);
    expect(runtime.resumeSession(session.id).state).toBe('ready');
    expect(runtime.pauseSession(session.id).state).toBe('ready');
    runtime.stopSession(session.id);
    expect(runtime.resumeSession(session.id).state).toBe('stopped');
  });

  it('clears stale plans and queue entries when loading a new behavior or invalid artifact', async () => {
    const runtime = createTestRuntime({
      dispatch: (command) => dispatched(command.id),
    });
    const session = loadTwoCommandSession(runtime);
    runtime.queueSession(session.id);
    runtime.loadBehavior(session.id, sampleMicroDuckLedBehavior);
    expect(runtime.inspectQueue().entries).toEqual([]);
    expect((await runtime.startSession(session.id)).dispatchResults).toEqual(
      [],
    );
    runtime.loadCompiledBehavior(
      session.id,
      sampleMicroDuckCompiledBehaviorArtifact,
    );
    runtime.confirmPolicy(session.id);
    runtime.loadCompiledBehavior(session.id, {
      ...sampleMicroDuckCompiledBehaviorArtifact,
      targetId: 'unknown',
    });
    expect((await runtime.startSession(session.id)).dispatchResults).toEqual(
      [],
    );
  });

  it('stops the sequence on a dispatch failure', async () => {
    const calls: string[] = [];
    const runtime = createTestRuntime({
      dispatch(command) {
        calls.push(command.id);
        return {
          commandId: command.id,
          status: 'failed',
          message: 'Disconnected.',
        };
      },
    });
    const session = loadTwoCommandSession(runtime);
    expect((await runtime.startSession(session.id)).snapshot.state).toBe(
      'error',
    );
    expect(calls).toEqual(['first']);
  });

  it('honors stop requested by the session-started listener before the first command', async () => {
    const calls: string[] = [];
    const runtime = createTestRuntime({
      dispatch(command) {
        calls.push(command.id);
        return dispatched(command.id);
      },
    });
    const session = loadTwoCommandSession(runtime);
    runtime.subscribe((event) => {
      if (event.type === 'session-started') runtime.stopSession(session.id);
    });
    expect((await runtime.startSession(session.id)).dispatchResults).toEqual(
      [],
    );
    expect(calls).toEqual([]);
    expect(runtime.inspectQueue().capabilityLocks).toEqual([]);
  });

  it('resumes during an in-flight command without dispatching it twice', async () => {
    const first = deferred<RuntimeCommandDispatchResult>();
    const calls: string[] = [];
    const runtime = createTestRuntime({
      dispatch(command) {
        calls.push(command.id);
        return calls.length === 1 ? first.promise : dispatched(command.id);
      },
    });
    const session = loadTwoCommandSession(runtime);
    const run = runtime.startSession(session.id);
    runtime.pauseSession(session.id);
    runtime.resumeSession(session.id);
    expect(calls).toEqual(['first']);
    first.resolve(dispatched('first'));
    await run;
    expect(calls).toEqual(['first', 'second']);
  });

  it('retains locks after cancellation until transport settles, then permits a fresh run', async () => {
    const first = deferred<RuntimeCommandDispatchResult>();
    let calls = 0;
    const runtime = createTestRuntime({
      dispatch(command) {
        calls += 1;
        return calls === 1 ? first.promise : dispatched(command.id);
      },
    });
    const owner = loadTwoCommandSession(runtime);
    const other = loadTwoCommandSession(runtime);
    const run = runtime.startSession(owner.id);
    runtime.stopSession(owner.id);
    expect((await runtime.startSession(other.id)).dispatchResults).toEqual([]);
    first.resolve(dispatched('first'));
    await run;
    runtime.loadCompiledBehavior(
      other.id,
      sampleMicroDuckCompiledBehaviorArtifact,
    );
    runtime.confirmPolicy(other.id);
    expect((await runtime.startSession(other.id)).dispatchResults).toHaveLength(
      1,
    );
  });

  it('does not wait for resume after a paused in-flight command fails', async () => {
    const first = deferred<RuntimeCommandDispatchResult>();
    const runtime = createTestRuntime({ dispatch: () => first.promise });
    const session = loadTwoCommandSession(runtime);
    const run = runtime.startSession(session.id);
    runtime.pauseSession(session.id);
    first.resolve({ commandId: 'first', status: 'failed', message: 'Failed.' });
    expect((await run).snapshot.state).toBe('error');
    expect(runtime.inspectQueue().capabilityLocks).toEqual([]);
  });

  it('does not replace an existing session with a duplicate id', () => {
    const runtime = createTestRuntime();
    const session = loadTwoCommandSession(runtime);
    expect(() => runtime.createSession({ id: session.id })).toThrow(
      'already registered',
    );
    expect(runtime.inspectSession(session.id).state).toBe('ready');
  });

  it('does not overwrite disposal requested by an artifact-loaded listener', () => {
    const runtime = createTestRuntime();
    const session = runtime.createSession();
    runtime.subscribe(event => {
      if (event.type === 'artifact-loaded') runtime.disposeSession(session.id);
    });
    runtime.loadCompiledBehavior(session.id, sampleMicroDuckCompiledBehaviorArtifact);
    expect(runtime.inspectSession(session.id).state).toBe('disposed');
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

function dispatched(commandId: string): RuntimeCommandDispatchResult {
  return {
    commandId,
    status: 'dispatched',
    message: `Dispatched ${commandId}.`,
  };
}

function loadTwoCommandSession(
  runtime: ReturnType<typeof createBotLabRuntime>,
) {
  const session = runtime.createSession();
  runtime.loadCompiledBehavior(session.id, {
    ...sampleMicroDuckCompiledBehaviorArtifact,
    commands: ['first', 'second'].map((id) => ({
      ...sampleMicroDuckCompiledBehaviorArtifact.commands[0],
      id,
    })),
  });
  runtime.confirmPolicy(session.id);
  return session;
}

function createTestRuntime(
  dispatcher?: Pick<RuntimeCommandDispatcher, 'dispatch'>,
  policies = samplePolicies,
) {
  return createBotLabRuntime({
    adapters: [microDuckAdapter],
    simulators: [],
    behaviors: [sampleMicroDuckLedBehavior],
    skills: sampleSkills,
    schedulers: sampleSchedulers,
    arbitrationStrategies: sampleArbitrationStrategies,
    policies,
    dispatchers: dispatcher
      ? [
          {
            targetId: 'microduck-usb',
            dispatch: dispatcher.dispatch,
          },
        ]
      : [],
    now: () => '2026-09-10T00:00:00.000Z',
  });
}

const microDuckAdapter: BotLabAdapter = {
  id: 'microduck',
  name: 'MicroDuck',
  status: 'available',
  targets: [
    {
      id: 'microduck-usb',
      name: 'MicroDuck USB',
      kind: 'robot',
      adapterId: 'microduck',
      status: 'available',
    },
  ],
  capabilities: [
    {
      id: 'microduck-leds',
      kind: 'light',
      name: 'LED matrix',
      description: 'Initial light output capability for MicroDuck behaviors.',
      targetIds: ['microduck-usb'],
      schema: {
        commands: [
          {
            id: 'set-led-pattern',
            name: 'Set LED pattern',
            description: 'Render a named LED pattern with a brightness value.',
            inputs: [
              {
                name: 'pattern',
                type: 'enum',
                required: true,
                enumValues: ['smile', 'blink', 'solid', 'off'],
              },
              {
                name: 'brightness',
                type: 'number',
                required: true,
                min: 0,
                max: 100,
              },
            ],
          },
        ],
        telemetry: [],
      },
    },
  ],
};
