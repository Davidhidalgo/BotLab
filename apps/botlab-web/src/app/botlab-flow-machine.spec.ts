import { createActor } from 'xstate';
import { botLabFlowMachine } from './botlab-flow-machine';

describe('botLabFlowMachine', () => {
  it('models workspace and execution regions independently', async () => {
    const actor = createActor(botLabFlowMachine);

    actor.start();

    expect(actor.getSnapshot().value).toEqual({
      workspace: 'loaded',
      build: 'draft',
      execution: 'ready',
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
        reject(new Error('BotLab flow did not compile in time.'));
      }, 1000);
    });

    actor.send({ type: 'build.compile' });
    await compiled;

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
      execution: 'completed',
    });
    expect(actor.getSnapshot().context.compiledArtifact?.id).toBe(
      'artifact-microduck-leds-plan',
    );
    expect(actor.getSnapshot().context.runMessage).toContain('1 comando(s) enviados');
  });
});
