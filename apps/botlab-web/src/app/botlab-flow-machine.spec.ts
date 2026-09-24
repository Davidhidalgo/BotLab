import { createActor, fromPromise, waitFor } from 'xstate';
import type { BotLabRuntime } from '@botlab/runtime';
import {
  createBotLabMessage,
  type BotLabMessage,
  type ExecutionResult,
} from '@botlab/model';
import { botLabFlowMachine } from './botlab-flow-machine';

describe('botLabFlowMachine', () => {
  it('exposes MicroDuck hardware and simulator through shared adapter capabilities', () => {
    const actor = createActor(botLabFlowMachine, { input: {} });

    actor.start();

    const runtime = actor.getSnapshot().context.runtime;
    const targets = runtime.listTargets();
    const capabilities = runtime.listCapabilities();

    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'microduck-usb',
          kind: 'robot',
          adapterId: 'microduck',
        }),
        expect.objectContaining({
          id: 'microduck-sim',
          kind: 'simulator',
          adapterId: 'microduck',
        }),
      ]),
    );
    expect(capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'microduck-leds',
          targetIds: expect.arrayContaining(['microduck-usb', 'microduck-sim']),
        }),
        expect.objectContaining({
          id: 'microduck-motion',
          targetIds: expect.arrayContaining(['microduck-usb', 'microduck-sim']),
        }),
      ]),
    );
  });

  it('models workspace and execution regions independently', async () => {
    const actor = createActor(botLabFlowMachine, { input: {} });

    actor.start();

    expect(actor.getSnapshot().value).toEqual({
      workspace: 'loaded',
      build: 'draft',
      simulation: 'idle',
      execution: 'ready',
    });
    expect(actor.getSnapshot().context.selectedTargetId).toBe(
      'stackchan-planned',
    );
    actor.send({ type: 'target.selected', targetId: 'microduck-sim' });

    const compiled = new Promise<void>((resolve, reject) => {
      const subscription = actor.subscribe((snapshot) => {
        if (snapshot.matches({ build: 'compiled' })) {
          globalThis.clearTimeout(timeout);
          subscription.unsubscribe();
          resolve();
        }
      });
      const timeout = globalThis.setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error('BotLab flow did not compile in time.'));
      }, 1000);
    });

    actor.send({ type: 'build.compile' });
    await compiled;

    const simulated = new Promise<void>((resolve, reject) => {
      const subscription = actor.subscribe((snapshot) => {
        if (snapshot.matches({ simulation: 'passed' })) {
          globalThis.clearTimeout(timeout);
          subscription.unsubscribe();
          resolve();
        }
      });
      const timeout = globalThis.setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error('BotLab flow did not simulate in time.'));
      }, 1000);
    });

    actor.send({ type: 'simulation.run' });
    await simulated;

    const completed = new Promise<void>((resolve, reject) => {
      const subscription = actor.subscribe((snapshot) => {
        if (snapshot.matches({ execution: 'dispatched' })) {
          globalThis.clearTimeout(timeout);
          subscription.unsubscribe();
          resolve();
        }
      });
      const timeout = globalThis.setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error('BotLab flow did not complete in time.'));
      }, 1000);
    });

    actor.send({ type: 'demo.run' });
    await completed;

    expect(actor.getSnapshot().value).toEqual({
      workspace: 'loaded',
      build: 'compiled',
      simulation: 'passed',
      execution: 'dispatched',
    });
    expect(actor.getSnapshot().context.compiledArtifact?.id).toBe(
      'artifact-microduck-led-demo-microduck-sim-smile-walk-5m-plan',
    );
    expect(actor.getSnapshot().context.compiledArtifact?.targetId).toBe(
      'microduck-sim',
    );
    expect(
      actor.getSnapshot().context.compiledArtifact?.commands[0].inputs,
    ).toEqual({
      brightness: 50,
      pattern: 'smile',
    });
    expect(
      actor.getSnapshot().context.compiledArtifact?.commands[1],
    ).toMatchObject({
      capabilityId: 'microduck-motion',
      commandId: 'drive-differential',
      inputs: {
        leftPower: 1,
        rightPower: 1,
        distanceMeters: 5,
      },
    });
    expect(actor.getSnapshot().context.simulationResult).toMatchObject({
      artifactId:
        'simout-artifact-microduck-led-demo-microduck-sim-smile-walk-5m-plan',
      status: 'passed',
      outputArtifact: {
        kind: 'simulator-output',
        sourceArtifactId:
          'artifact-microduck-led-demo-microduck-sim-smile-walk-5m-plan',
        commandCount: 3,
      },
    });
    expect(
      actor.getSnapshot().context.flowLog.map((entry) => entry.category),
    ).toEqual(expect.arrayContaining(['build', 'simulation', 'execution']));
    expect(actor.getSnapshot().context.runMessage).toMatchObject({
      code: 'flow.commands-sent',
      params: { count: 3 },
    });
    expect(actor.getSnapshot().context.runMessage.text).toContain(
      '3 command(s) sent',
    );
  });

  it.each(['failed', 'cancelled', 'confirmation-required', 'no-work'] as const)(
    'routes a resolved %s result without claiming completion',
    async (status) => {
      const actor = createActor(
        botLabFlowMachine.provide({
          actors: {
            runQueuedDemo: fromPromise<
              {
                runtimeSnapshot: ReturnType<BotLabRuntime['inspectRuntime']>;
                runMessage: BotLabMessage;
                outcome: ExecutionResult;
              },
              { runtime: BotLabRuntime }
            >(async ({ input }: { input: { runtime: BotLabRuntime } }) => ({
              runtimeSnapshot: input.runtime.inspectRuntime(),
              runMessage: createBotLabMessage('test.status', status),
              outcome: {
                executionId: 'test-run',
                status,
                evidence: 'none' as const,
              },
            })),
          },
        }),
        { input: {} },
      ).start();
      actor.send({ type: 'target.selected', targetId: 'microduck-sim' });
      actor.send({ type: 'build.compile' });
      await waitFor(actor, (state) => state.matches({ build: 'compiled' }));
      actor.send({ type: 'simulation.run' });
      await waitFor(actor, (state) => state.matches({ simulation: 'passed' }));
      actor.send({ type: 'demo.run' });
      await waitFor(actor, (state) => state.matches({ execution: status }));
      expect(actor.getSnapshot().context.executionResult?.status).toBe(status);
      actor.send({
        type: 'workspace.changed',
        artifact: actor.getSnapshot().context.workspaceArtifact,
      });
      expect(actor.getSnapshot().matches({ execution: 'ready' })).toBe(true);
      expect(actor.getSnapshot().context.executionResult).toBeUndefined();
      actor.stop();
    },
  );

  it('blocks compilation for planned or incompatible targets', () => {
    const actor = createActor(botLabFlowMachine, { input: {} });

    actor.start();
    actor.send({ type: 'target.selected', targetId: 'stackchan-planned' });
    actor.send({ type: 'build.compile' });

    expect(actor.getSnapshot().value).toMatchObject({
      build: 'stale',
      simulation: 'stale',
      execution: 'ready',
    });
    expect(actor.getSnapshot().context.selectedTargetId).toBe(
      'stackchan-planned',
    );
    expect(actor.getSnapshot().context.compiledArtifact).toBeUndefined();
  });

  it('compiles the selected MicroDuck LED pattern from Scratch XML', async () => {
    const actor = createActor(botLabFlowMachine, { input: {} });

    actor.start();
    actor.send({ type: 'target.selected', targetId: 'microduck-sim' });
    actor.send({
      type: 'workspace.changed',
      artifact: {
        ...actor.getSnapshot().context.workspaceArtifact,
        content:
          '<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="start"><next><block type="botlab_microduck_set_leds" id="leds"><field name="PATTERN">off</field><next><block type="botlab_microduck_walk_distance" id="walk"><field name="DISTANCE">2.5</field></block></next></block></next></block></xml>',
        status: 'dirty',
      },
    });

    const compiled = new Promise<void>((resolve, reject) => {
      const subscription = actor.subscribe((snapshot) => {
        if (snapshot.matches({ build: 'compiled' })) {
          globalThis.clearTimeout(timeout);
          subscription.unsubscribe();
          resolve();
        }
      });
      const timeout = globalThis.setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error('BotLab flow did not compile edited XML in time.'));
      }, 1000);
    });

    actor.send({ type: 'build.compile' });
    await compiled;

    expect(
      actor.getSnapshot().context.compiledArtifact?.commands[0].inputs,
    ).toEqual({
      brightness: 50,
      pattern: 'off',
    });
    expect(
      actor.getSnapshot().context.compiledArtifact?.commands[1].inputs,
    ).toMatchObject({
      distanceMeters: 2.5,
    });
  });
});
