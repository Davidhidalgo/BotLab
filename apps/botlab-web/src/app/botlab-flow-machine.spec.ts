import { createActor } from 'xstate';
import { botLabFlowMachine } from './botlab-flow-machine';

describe('botLabFlowMachine', () => {
  it('models workspace and execution regions independently', async () => {
    const actor = createActor(botLabFlowMachine);

    actor.start();

    expect(actor.getSnapshot().value).toEqual({
      workspace: 'loaded',
      build: 'draft',
      simulation: 'idle',
      execution: 'ready',
    });
    expect(actor.getSnapshot().context.selectedTargetId).toBe('microduck-sim');

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
        if (snapshot.matches({ execution: 'completed' })) {
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
      execution: 'completed',
    });
    expect(actor.getSnapshot().context.compiledArtifact?.id).toBe(
      'artifact-microduck-leds-plan',
    );
    expect(actor.getSnapshot().context.compiledArtifact?.targetId).toBe(
      'microduck-sim',
    );
    expect(actor.getSnapshot().context.simulationResult).toMatchObject({
      artifactId: 'artifact-microduck-leds-plan',
      status: 'passed',
    });
    expect(actor.getSnapshot().context.flowLog.map((entry) => entry.category)).toEqual(
      expect.arrayContaining(['build', 'simulation', 'execution']),
    );
    expect(actor.getSnapshot().context.runMessage).toContain('1 comando(s) enviados');
  });

  it('blocks compilation for planned or incompatible targets', () => {
    const actor = createActor(botLabFlowMachine);

    actor.start();
    actor.send({ type: 'target.selected', targetId: 'stackchan-planned' });
    actor.send({ type: 'build.compile' });

    expect(actor.getSnapshot().value).toMatchObject({
      build: 'stale',
      simulation: 'stale',
      execution: 'ready',
    });
    expect(actor.getSnapshot().context.selectedTargetId).toBe('stackchan-planned');
    expect(actor.getSnapshot().context.compiledArtifact).toBeUndefined();
  });
});
