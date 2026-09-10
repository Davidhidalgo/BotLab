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
      state: 'ready',
      behaviorId: 'microduck-led-demo',
      targetId: 'microduck-usb',
      loadedArtifactId: 'artifact-microduck-leds-plan',
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
    await runtime.startSession(session.id);
    unsubscribe();
    runtime.pauseSession(session.id);

    expect(events).toEqual([
      'session-created',
      'artifact-loaded',
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
  });
});

function createTestRuntime(dispatcher?: {
  dispatch(command: CompiledCommand): RuntimeCommandDispatchResult;
}) {
  return createBotLabRuntime({
    adapters: [microDuckAdapter],
    simulators: [],
    behaviors: [sampleMicroDuckLedBehavior],
    skills: sampleSkills,
    schedulers: sampleSchedulers,
    arbitrationStrategies: sampleArbitrationStrategies,
    policies: samplePolicies,
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
