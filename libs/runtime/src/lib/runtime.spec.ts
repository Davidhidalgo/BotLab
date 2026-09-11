import type { RuntimeCommandDispatchResult } from './runtime';
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

    runtime.loadCompiledBehavior(session.id, sampleMicroDuckCompiledBehaviorArtifact);

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
    runtime.loadCompiledBehavior(session.id, sampleMicroDuckCompiledBehaviorArtifact);
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

    runtime.loadCompiledBehavior(session.id, sampleMicroDuckCompiledBehaviorArtifact);
    runtime.confirmPolicy(session.id);
    await runtime.startSession(session.id);
    unsubscribe();
    runtime.pauseSession(session.id);

    expect(events).toEqual([
      'session-created',
      'artifact-loaded',
      'policy-evaluated',
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

    runtime.loadCompiledBehavior(session.id, sampleMicroDuckCompiledBehaviorArtifact);
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

    runtime.loadCompiledBehavior(session.id, sampleMicroDuckCompiledBehaviorArtifact);
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
    const lowPrioritySession = runtime.createSession({ id: 'session-low-priority' });
    const highPrioritySession = runtime.createSession({ id: 'session-high-priority' });

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
    const queue = runtime.queueSession(highPrioritySession.id, { priority: 10 });

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
    expect(runtime.inspectQueue().entries.map((entry) => entry.sessionId)).toEqual([
      'session-low-priority',
    ]);
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
    const secondSession = runtime.createSession({ id: 'session-lock-conflict' });

    runtime.loadCompiledBehavior(firstSession.id, sampleMicroDuckCompiledBehaviorArtifact);
    runtime.loadCompiledBehavior(secondSession.id, sampleMicroDuckCompiledBehaviorArtifact);
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
});

function createTestRuntime(dispatcher?: {
  dispatch(
    command: CompiledCommand,
  ): RuntimeCommandDispatchResult | Promise<RuntimeCommandDispatchResult>;
}, policies = samplePolicies) {
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
